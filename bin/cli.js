#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { readdir, stat, readFile } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import chalk from 'chalk';
import figlet from 'figlet';
import ora from 'ora';
import inquirer from 'inquirer';
import { createRequire } from 'node:module';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const SUPPORTED_EXTENSIONS = ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'];

const { values, positionals } = parseArgs({
  options: {
    help: { type: 'boolean', short: 'h', default: false },
    framework: { type: 'string', short: 'f', default: 'auto' },
    output: { type: 'string', short: 'o', default: 'table' },
    verbose: { type: 'boolean', short: 'v', default: false },
    json: { type: 'boolean', default: false },
    markdown: { type: 'boolean', short: 'm', default: false },
    filter: { type: 'string', short: 'F', default: '' },
    interactive: { type: 'boolean', short: 'i', default: false },
    code: { type: 'boolean', short: 'c', default: false },
    noColor: { type: 'boolean', default: false },
  },
  allowPositionals: true,
  strict: false,
});

const c = chalk;

function printBanner() {
  console.log(c.cyan(figlet.textSync('API Route Lister', { font: 'Small Slant' })));
  console.log(c.gray('━'.repeat(50)));
}

function printHelp() {
  printBanner();
  console.log(`
${c.green('Usage:')} api-route-lister <source-path> [options]

${c.green('Options:')}
  -h, --help         Show this help message
  -f, --framework    Framework: auto, express, fastify, nextjs, hapi, koa
  -o, --output       Output format: table, list, tree (default: table)
  -v, --verbose      Show detailed information
  --json             Output routes as JSON
  -m, --markdown     Output routes as Markdown table
  -F, --filter       Filter routes by pattern
  -i, --interactive  Interactive mode (browse routes, view code)
  -c, --code         Show endpoint code in output
  --no-color         Disable colors

${c.green('Examples:')}
  api-route-lister ./src
  api-route-lister ./src -i
  api-route-lister ./src -o tree -c
  api-route-lister ./src -F '/api/users/*'
`);
}

async function* walkDir(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      yield* walkDir(fullPath);
    } else if (entry.isFile() && SUPPORTED_EXTENSIONS.includes(extname(entry.name))) {
      yield fullPath;
    }
  }
}

function detectFramework(files) {
  const content = files.map(f => f.content).join('\n');
  
  if (content.includes("from 'next'") || content.includes('from "next"') || content.includes('Next.js')) return 'nextjs';
  if (content.includes("from 'express'") || content.includes('from "express"')) return 'express';
  if (content.includes("from '@fastify'") || content.includes('from "fastify"')) return 'fastify';
  if (content.includes("from '@hapi/hapi'") || content.includes('from "@hapi/hapi"')) return 'hapi';
  if (content.includes("from 'koa'") || content.includes('from "koa"') || content.includes('koa-router')) return 'koa';
  return 'express';
}

function extractRoutes(content, framework, filePath) {
  const routes = [];
  
  if (framework === 'nextjs') {
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      const lineNum = index + 1;
      const match = line.match(/(?:export\s+(?:async\s+)?)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)/i);
      if (match) {
        routes.push({ method: match[1].toUpperCase(), path: extractNextJsPath(filePath), file: relative(process.cwd(), filePath), line: lineNum });
      }
      const constMatch = line.match(/export\s+(?:const|let|var)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)/i);
      if (constMatch) {
        routes.push({ method: constMatch[1].toUpperCase(), path: extractNextJsPath(filePath), file: relative(process.cwd(), filePath), line: lineNum });
      }
    });
    return routes;
  }
  
  if (framework === 'hapi') {
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      const lineNum = index + 1;
      const routeMatch = line.match(/path\s*:\s*['"`]([^'"`]+)['"`]/);
      const methodMatch = line.match(/method\s*:\s*['"`]([^'"`]+)['"`]/);
      if (routeMatch) {
        routes.push({ method: methodMatch ? methodMatch[1].toUpperCase() : '*', path: routeMatch[1], file: relative(process.cwd(), filePath), line: lineNum });
      }
    });
    return routes;
  }
  
  const prefixes = framework === 'fastify' ? ['fastify'] : framework === 'koa' ? ['router'] : ['app', 'router'];
  const verbs = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all'];
  
  prefixes.forEach(prefix => {
    verbs.forEach(verb => {
      const regex = new RegExp(prefix + '\\.' + verb + '\\s*\\(\\s*([\'"`])(.*?)\\1', 'gs');
      let match;
      while ((match = regex.exec(content)) !== null) {
        routes.push({ method: verb.toUpperCase(), path: match[2], file: relative(process.cwd(), filePath), line: getLineNumber(content, match.index) });
      }
    });
  });
  
  const seen = new Set();
  return routes.filter(r => {
    const key = `${r.method}:${r.path}:${r.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.line - b.line);
}

function getLineNumber(content, index) {
  return content.substring(0, index).split('\n').length;
}

function extractNextJsPath(filePath) {
  const apiMatch = filePath.match(/[\\/]api[\\/](.+?)(?:[\\/]route)?\.(?:ts|js|tsx|jsx)$/i);
  if (apiMatch) {
    const pathParts = apiMatch[1].replace(/\\/g, '/').split('/');
    return '/api/' + pathParts.map(p => p.replace(/\)\//g, '/').replace(/\[/g, ':').replace(/\]/g, '')).join('/');
  }
  return '/api/[unknown]';
}

function filterRoutes(routes, pattern) {
  if (!pattern) return routes;
  try {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped.replace(/\*/g, '.*'), 'i');
    return routes.filter(r => regex.test(r.path) || regex.test(r.method));
  } catch {
    return routes.filter(r => r.path.toLowerCase().includes(pattern.toLowerCase()));
  }
}

function getMethodColor(method) {
  const colors = { GET: 'green', POST: 'blue', PUT: 'yellow', PATCH: 'cyan', DELETE: 'red', HEAD: 'magenta', OPTIONS: 'gray', ALL: 'white' };
  return colors[method] || 'white';
}

function getCode(content, line, context = 15) {
  const lines = content.split('\n');
  const start = Math.max(0, line - context - 1);
  const end = Math.min(lines.length, line + context);
  return lines.slice(start, end).map((l, i) => ({
    num: start + i + 1,
    text: l,
    highlight: start + i + 1 === line
  }));
}

async function displayCode(route, allRoutes) {
  const filePath = join(process.cwd(), route.file);
  const content = await readFile(filePath, 'utf-8');
  const code = getCode(content, route.line);
  
  console.clear();
  printBanner();
  console.log(`\n${c.green('Route:')} ${c[getMethodColor(route.method)](route.method)} ${c.white(route.path)}`);
  console.log(`${c.gray('File:')} ${route.file}:${route.line}\n`);
  console.log(c.gray('─'.repeat(60)));
  
  code.forEach(({ num, text, highlight }) => {
    const prefix = c.gray(String(num).padStart(4) + ' |');
    if (highlight) {
      console.log(`${prefix} ${c.bgYellow.black(text)}`);
    } else {
      console.log(`${prefix} ${text}`);
    }
  });
  
  console.log(c.gray('─'.repeat(60)));
  console.log(`\n${c.cyan('↑/↓')} Navigate ${c.cyan('Enter')} Select ${c.cyan('C')} Copy ${c.cyan('Esc')} Exit\n`);
}

async function interactiveMode(routes, files) {
  let selectedIndex = 0;
  let searchQuery = '';
  let filteredRoutes = [...routes];
  
  const fileContents = {};
  for (const file of files) {
    fileContents[file.path] = await readFile(file.path, 'utf-8');
  }
  
  while (true) {
    console.clear();
    printBanner();
    console.log(c.gray(`Found ${routes.length} routes\n`));
    
    if (searchQuery) {
      console.log(c.yellow(`Searching: "${searchQuery}" (${filteredRoutes.length} matches)\n`));
    }
    
    const displayRoutes = filteredRoutes.slice(0, 25);
    
    displayRoutes.forEach((route, i) => {
      const marker = i === selectedIndex ? c.cyan('>') : ' ';
      const methodColor = getMethodColor(route.method);
      const fileName = route.file.split(/[/\\]/).pop();
      if (i === selectedIndex) {
        console.log(`${marker} ${c[methodColor](route.method.padEnd(7))} ${c.white(route.path)}`);
        console.log(`  ${c.gray(fileName + ':' + route.line)}`);
      } else {
        console.log(`${marker} ${c[methodColor](route.method.padEnd(7))} ${c.gray(route.path)}`);
      }
    });
    
    if (filteredRoutes.length > 25) {
      console.log(c.gray(`\n... ${filteredRoutes.length - 25} more (use search to filter)`));
    }
    
    console.log(c.gray('\n' + '─'.repeat(60)));
    console.log(c.green('[n]') + ' Next  ' + c.green('[p]') + ' Prev  ' + c.green('[v]') + ' View Code  ' + c.green('[/]') + ' Search  ' + c.green('[f]') + ' Filter  ' + c.green('[q]') + ' Quit');
    
    const { action } = await inquirer.prompt([{
      type: 'input',
      name: 'action',
      message: 'Action:',
      default: '',
    }]);
    
    if (action === 'q' || action === 'quit' || action === 'exit') {
      break;
    } else if (action === 'n' || action === 'next') {
      selectedIndex = Math.min(filteredRoutes.length - 1, selectedIndex + 1);
    } else if (action === 'p' || action === 'prev' || action === 'previous') {
      selectedIndex = Math.max(0, selectedIndex - 1);
    } else if (action === 'v' || action === 'view' || action === '') {
      if (filteredRoutes[selectedIndex]) {
        const route = filteredRoutes[selectedIndex];
        const filePath = join(process.cwd(), route.file);
        const content = fileContents[filePath] || await readFile(filePath, 'utf-8');
        
        console.clear();
        printBanner();
        console.log(c.green('Route:') + ' ' + c[getMethodColor(route.method)](route.method) + ' ' + c.white(route.path));
        console.log(c.gray('File:') + ' ' + route.file + ':' + route.line + '\n');
        console.log(c.gray('─'.repeat(60)));
        
        const code = getCode(content, route.line, 20);
        code.forEach(({ num, text, highlight }) => {
          const prefix = c.gray(String(num).padStart(4) + ' |');
          if (highlight) {
            console.log(prefix + ' ' + c.bgYellow.black(text));
          } else {
            console.log(prefix + ' ' + text);
          }
        });
        
        console.log(c.gray('─'.repeat(60)));
        console.log(c.green('[c]') + ' Copy Code  ' + c.green('[b]') + ' Back to list\n');
        
        const { codeAction } = await inquirer.prompt([{
          type: 'input',
          name: 'codeAction',
          message: 'Action:',
          default: '',
        }]);
        
        if (codeAction === 'c' || codeAction === 'copy') {
          const codeText = code.map(l => `${l.num} | ${l.text}`).join('\n');
          console.log(c.cyan('\nCopy this code:\n'));
          console.log(codeText);
        }
      }
    } else if (action === '/') {
      const { query } = await inquirer.prompt([{
        type: 'input',
        name: 'query',
        message: 'Search routes:',
        default: searchQuery,
      }]);
      searchQuery = query;
      filteredRoutes = filterRoutes(routes, searchQuery);
      selectedIndex = 0;
    } else if (action === 'f' || action === 'filter') {
      const { method } = await inquirer.prompt([{
        type: 'list',
        name: 'method',
        message: 'Filter by method:',
        choices: ['All', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'],
      }]);
      if (method !== 'All') {
        filteredRoutes = routes.filter(r => r.method === method);
        searchQuery = '';
        selectedIndex = 0;
      }
    } else if (action === 'r' || action === 'reset') {
      filteredRoutes = [...routes];
      searchQuery = '';
      selectedIndex = 0;
    }
  }
}

async function copyToClipboard(text) {
  try {
    if (process.platform === 'win32') {
      await execAsync(`echo ${text.replace(/"/g, '\\"').replace(/\n/g, '\r\n')} | clip`);
    } else {
      await execAsync(`echo "${text}" | pbcopy`);
    }
  } catch {
    console.log(c.yellow('\nCould not copy to clipboard'));
  }
}

function formatTable(routes, files, showCode = false) {
  if (routes.length === 0) {
    console.log(c.yellow('\nNo routes found.'));
    return;
  }
  
  const methodWidth = 10;
  const pathWidth = Math.max(50, ...routes.map(r => r.path.length));
  const fileWidth = Math.max(40, ...routes.map(r => r.file.length));
  
  console.log();
  console.log(c.bold(`${'METHOD'.padEnd(methodWidth)} ${'PATH'.padEnd(pathWidth)} ${'FILE'.padEnd(fileWidth)} ${'LINE'}`));
  console.log(c.gray('-'.repeat(methodWidth + pathWidth + fileWidth + 10)));
  
  routes.forEach(route => {
    const methodColor = getMethodColor(route.method);
    console.log(`${c[methodColor](route.method.padEnd(methodWidth))} ${c.white(route.path.padEnd(pathWidth))} ${c.gray(route.file.padEnd(fileWidth))} ${c.gray(route.line)}`);
    
    if (showCode) {
      const filePath = join(process.cwd(), route.file);
      const content = files.find(f => f.path === filePath)?.content || '';
      const code = getCode(content, route.line, 3);
      code.forEach(({ num, text }) => {
        console.log(c.gray(`    ${String(num).padStart(4)} | ${text}`));
      });
      console.log();
    }
  });
}

function formatList(routes, files, showCode = false) {
  if (routes.length === 0) {
    console.log(c.yellow('\nNo routes found.'));
    return;
  }
  
  console.log();
  routes.forEach(route => {
    const methodColor = getMethodColor(route.method);
    console.log(`${c[methodColor](route.method)} ${route.path} ${c.gray(`(${route.file}:${route.line})`)}`);
    
    if (showCode) {
      const filePath = join(process.cwd(), route.file);
      const content = files.find(f => f.path === filePath)?.content || '';
      const code = getCode(content, route.line, 5);
      code.forEach(({ num, text }) => {
        console.log(c.gray(`  ${String(num)} | ${text}`));
      });
      console.log();
    }
  });
}

function formatTree(routes, files, showCode = false) {
  if (routes.length === 0) {
    console.log(c.yellow('\nNo routes found.'));
    return;
  }
  
  const grouped = {};
  routes.forEach(route => {
    const parts = route.path.split('/').filter(Boolean);
    let current = grouped;
    
    parts.forEach((part, i) => {
      if (!current[part]) {
        current[part] = { _routes: [], _children: {} };
      }
      if (i === parts.length - 1) {
        current[part]._routes.push(route);
      } else {
        current = current[part]._children;
      }
    });
  });
  
  function printNode(node, prefix = '', isLast = true) {
    const routeList = node._routes || [];
    const children = node._children || {};
    const childKeys = Object.keys(children);
    
    routeList.forEach((route, i) => {
      const isLastRoute = i === routeList.length - 1 && childKeys.length === 0;
      const methodColor = getMethodColor(route.method);
      const connector = isLastRoute ? '└── ' : '├── ';
      console.log(`${prefix}${connector}${c[methodColor](route.method.padEnd(7))} ${c.white(route.path)}`);
      
      if (showCode) {
        const filePath = join(process.cwd(), route.file);
        const content = files.find(f => f.path === filePath)?.content || '';
        const code = getCode(content, route.line, 3);
        code.forEach(({ num, text }) => {
          console.log(`${prefix}    ${c.gray(String(num) + ' | ' + text)}`);
        });
      }
    });
    
    childKeys.forEach((key, i) => {
      const isLastChild = i === childKeys.length - 1;
      const connector = isLastChild ? '└── ' : '├── ';
      console.log(`${prefix}${connector}${c.yellow(key)}`);
      printNode(children[key], prefix + (isLastChild ? '    ' : '│   '), isLastChild);
    });
  }
  
  console.log();
  Object.keys(grouped).sort().forEach(key => {
    console.log(c.cyan(key));
    printNode(grouped[key], '', true);
  });
}

function formatJson(routes) {
  console.log(JSON.stringify(routes, null, 2));
}

function formatMarkdown(routes) {
  if (routes.length === 0) {
    console.log('\nNo routes found.');
    return;
  }
  
  console.log('\n| METHOD | PATH | FILE | LINE |');
  console.log('|--------|------|------|------|');
  routes.forEach(route => {
    console.log(`| ${route.method} | ${route.path} | ${route.file} | ${route.line} |`);
  });
}

async function main() {
  if (values.help || positionals.length === 0) {
    printHelp();
    process.exit(0);
  }
  
  const sourcePath = positionals[0];
  const spinner = ora('Scanning source files...').start();
  
  try {
    const pathStat = await stat(sourcePath);
    if (!pathStat.isDirectory()) {
      spinner.fail('Source path must be a directory');
      process.exit(1);
    }
  } catch {
    spinner.fail('Source path does not exist');
    process.exit(1);
  }
  
  const files = [];
  for await (const file of walkDir(sourcePath)) {
    const content = await readFile(file, 'utf-8');
    files.push({ path: file, content });
  }
  
  spinner.text = 'Detecting framework...';
  
  let framework = values.framework;
  if (framework === 'auto') {
    framework = detectFramework(files);
  }
  
  spinner.text = `Extracting routes (${framework})...`;
  
  const allRoutes = [];
  files.forEach(({ path, content }) => {
    const routes = extractRoutes(content, framework, path);
    allRoutes.push(...routes);
  });
  
  const filteredRoutes = filterRoutes(allRoutes, values.filter);
  
  spinner.succeed(`Found ${filteredRoutes.length} routes in ${files.length} files`);
  
  console.log(c.gray(`\nFramework: ${c.cyan(framework.toUpperCase())}`));
  
  if (values.interactive) {
    await interactiveMode(filteredRoutes, files);
    return;
  }
  
  if (values.json) {
    formatJson(filteredRoutes);
  } else if (values.markdown) {
    formatMarkdown(filteredRoutes);
  } else {
    const showCode = values.code;
    switch (values.output) {
      case 'list':
        formatList(filteredRoutes, files, showCode);
        break;
      case 'tree':
        formatTree(filteredRoutes, files, showCode);
        break;
      default:
        formatTable(filteredRoutes, files, showCode);
    }
  }
  
  if (values.verbose) {
    console.log(c.gray(`\nTotal files scanned: ${files.length}`));
    console.log(c.gray(`Source path: ${sourcePath}`));
    console.log(c.gray(`Framework: ${framework}`));
  }
  
  console.log(c.cyan('\nTip: Use -i for interactive mode, -c to show code\n'));
}

main().catch(err => {
  console.error(c.red('Error:'), err.message);
  process.exit(1);
});
