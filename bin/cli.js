#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { readdir, stat, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import * as readline from 'node:readline';

const SUPPORTED_EXTENSIONS = ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'];

const parsed = parseArgs({
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

const { values, positionals } = parsed;

const c = chalk;

function printBanner() {
  console.log(c.cyan('╔══════════════════════════════════════╗'));
  console.log(c.cyan('║      API Route Lister v1.0.0          ║'));
  console.log(c.cyan('╚══════════════════════════════════════╝'));
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

function formatTable(routes, files, showCode = false) {
  if (routes.length === 0) { console.log(c.yellow('\nNo routes found.')); return; }
  const methodWidth = 10;
  const pathWidth = Math.max(50, ...routes.map(r => r.path.length));
  const fileWidth = Math.max(40, ...routes.map(r => r.file.length));
  console.log();
  console.log(c.bold(`${'METHOD'.padEnd(methodWidth)} ${'PATH'.padEnd(pathWidth)} ${'FILE'.padEnd(fileWidth)} ${'LINE'}`));
  console.log(c.gray('-'.repeat(methodWidth + pathWidth + fileWidth + 10)));
  routes.forEach(route => {
    const methodColor = getMethodColor(route.method);
    console.log(`${c[methodColor](route.method.padEnd(methodWidth))} ${c.white(route.path.padEnd(pathWidth))} ${c.gray(route.file.padEnd(fileWidth))} ${c.gray(route.line)}`);
  });
}

function formatList(routes) {
  if (routes.length === 0) { console.log(c.yellow('\nNo routes found.')); return; }
  console.log();
  routes.forEach(route => {
    const methodColor = getMethodColor(route.method);
    console.log(`${c[methodColor](route.method)} ${route.path} ${c.gray(`(${route.file}:${route.line})`)}`);
  });
}

function formatTree(routes) {
  if (routes.length === 0) { console.log(c.yellow('\nNo routes found.')); return; }
  const grouped = {};
  routes.forEach(route => {
    const parts = route.path.split('/').filter(Boolean);
    let current = grouped;
    parts.forEach((part, i) => {
      if (!current[part]) current[part] = { _routes: [], _children: {} };
      if (i === parts.length - 1) current[part]._routes.push(route);
      else current = current[part]._children;
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
  if (routes.length === 0) { console.log('\nNo routes found.'); return; }
  console.log('\n| METHOD | PATH | FILE | LINE |');
  console.log('|--------|------|------|------|');
  routes.forEach(route => {
    console.log(`| ${route.method} | ${route.path} | ${route.file} | ${route.line} |`);
  });
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => { rl.close(); resolve(answer); });
  });
}

async function interactiveMode(routes, files) {
  let selectedIndex = 0;
  let page = 0;
  const pageSize = 30;
  let searchQuery = '';
  let filteredRoutes = [...routes];
  
  const fileContents = {};
  for (const file of files) {
    fileContents[file.path] = await readFile(file.path, 'utf-8');
  }
   
  function displayPage() {
    console.clear();
    printBanner();
    
    const totalPages = Math.ceil(filteredRoutes.length / pageSize) || 1;
    console.log(c.cyan('API Route Lister') + c.gray(' | ') + c.green(`${filteredRoutes.length} routes`) + c.gray(' | Page ') + c.yellow(`${page + 1}/${totalPages}`));
    
    if (searchQuery) {
      console.log(c.magenta(`\n  Search: "${searchQuery}"`) + c.gray(' (') + c.cyan('/') + c.gray(' to change)\n'));
    } else {
      console.log('');
    }
    
    const start = page * pageSize;
    const end = Math.min(start + pageSize, filteredRoutes.length);
    
    for (let i = start; i < end; i++) {
      const route = filteredRoutes[i];
      const isSelected = i === selectedIndex;
      const marker = isSelected ? c.cyan('>') : ' ';
      const methodColor = getMethodColor(route.method);
      const displayNum = c.gray(`${String(i + 1).padStart(3)}. `);
      
      console.log(`${displayNum}${marker} ${c[methodColor](route.method.padEnd(7))} ${isSelected ? c.white(route.path) : c.gray(route.path)}`);
    }
    
    if (totalPages > 1) {
      console.log(c.gray('\n' + '─'.repeat(60)));
      const pages = [];
      for (let p = 0; p < totalPages; p++) {
        pages.push(p === page ? c.cyan(`[${p + 1}]`) : c.gray(`[${p + 1}]`));
      }
      console.log(pages.join(' '));
    }
    
    console.log(c.gray('\n' + '─'.repeat(60)));
    console.log(c.green('[j]') + ' Next  ' + c.green('[k]') + ' Prev  ' + c.green('[v]') + ' View Code  ' + c.green('[g]') + ' Go To  ' + c.green('[/]') + ' Search  ' + c.green('[f]') + ' Filter  ' + c.green('[r]') + ' Reset  ' + c.green('[q]') + ' Quit\n');
  }
  
  function goToRoute(index) {
    selectedIndex = Math.max(0, Math.min(filteredRoutes.length - 1, index));
    page = Math.floor(selectedIndex / pageSize);
  }
  
  function showCodeView(route) {
    const filePath = join(process.cwd(), route.file);
    const content = fileContents[filePath] || readFileSync(filePath, 'utf-8');
    
    console.clear();
    printBanner();
    console.log(c.green('  Method: ') + c[getMethodColor(route.method)](route.method));
    console.log(c.green('  Path:   ') + c.white(route.path));
    console.log(c.green('  File:   ') + c.gray(route.file + ':' + route.line));
    console.log(c.cyan('\n  CODE:\n'));
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
    console.log(c.cyan('ACTIONS:'));
    console.log(c.green('  b') + ' - Back to list\n');
  }
  
  displayPage();
  
  while (true) {
    process.stdout.write(c.yellow('> '));
    const input = await ask('');
    const parts = input.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg = parts.slice(1).join(' ');
    
    if (cmd === 'q' || cmd === 'quit' || cmd === 'exit') {
      console.log(c.green('\n  Thanks for using API Route Lister! Goodbye!\n'));
      break;
    } else if (cmd === 'j' || cmd === 'down') {
      goToRoute(selectedIndex + 1);
      displayPage();
    } else if (cmd === 'k' || cmd === 'up') {
      goToRoute(selectedIndex - 1);
      displayPage();
    } else if (cmd === 'g' || cmd === 'goto') {
      if (arg) {
        const routeNum = parseInt(arg);
        if (routeNum && routeNum > 0 && routeNum <= filteredRoutes.length) {
          goToRoute(routeNum - 1);
        }
        displayPage();
      } else {
        console.log(c.gray('\n  ╔══════════════════════════════════════════════════╗'));
        console.log(c.gray('  ║') + c.cyan('  [g] Go To Route Number') + c.gray('                              ║'));
        console.log(c.gray('  ╠══════════════════════════════════════════════════╣'));
        console.log(c.gray('  ║') + c.white('  Example: ') + c.green('g 25') + c.gray('  or  ') + c.green('g 1') + c.gray('                          ║'));
        console.log(c.gray('  ║') + c.gray('  Available: 1 - ') + c.yellow(`${filteredRoutes.length}`) + c.gray('                              ║'));
        console.log(c.gray('  ╚══════════════════════════════════════════════════╝'));
        process.stdout.write(c.yellow('\n  Enter route number: '));
        const num = await ask('');
        const routeNum = parseInt(num);
        if (routeNum && routeNum > 0 && routeNum <= filteredRoutes.length) {
          goToRoute(routeNum - 1);
        }
        displayPage();
      }
    } else if (cmd === 'v' || cmd === 'view') {
      if (filteredRoutes[selectedIndex]) {
        showCodeView(filteredRoutes[selectedIndex]);
        process.stdout.write(c.yellow('\n  Press Enter to go back: '));
        await ask('');
        displayPage();
      } else {
        displayPage();
      }
    } else if (cmd === '/' || cmd === 'search') {
      if (arg) {
        searchQuery = arg;
        filteredRoutes = filterRoutes(routes, searchQuery);
        selectedIndex = 0;
        page = 0;
        displayPage();
      } else {
        console.log(c.gray('\n  ╔══════════════════════════════════════════════════╗'));
        console.log(c.gray('  ║') + c.cyan('  [/] Search Routes') + c.gray('                                  ║'));
        console.log(c.gray('  ╠══════════════════════════════════════════════════╣'));
        console.log(c.gray('  ║') + c.white('  Example: ') + c.green('/users') + c.gray('  or  ') + c.green('/api/v1/*') + c.gray('                    ║'));
        console.log(c.gray('  ║') + c.gray('  Supports partial match and patterns') + c.gray('              ║'));
        console.log(c.gray('  ╚══════════════════════════════════════════════════╝'));
        process.stdout.write(c.yellow('\n  Enter search text: '));
        const query = await ask('');
        if (query.trim()) {
          searchQuery = query.trim();
          filteredRoutes = filterRoutes(routes, searchQuery);
          selectedIndex = 0;
          page = 0;
        }
        displayPage();
      }
    } else if (cmd === 'f' || cmd === 'filter') {
      if (arg && ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'ALL'].includes(arg.toUpperCase())) {
        if (arg.toUpperCase() === 'ALL') {
          filteredRoutes = [...routes];
          searchQuery = '';
        } else {
          filteredRoutes = routes.filter(r => r.method === arg.toUpperCase());
          searchQuery = '';
        }
        selectedIndex = 0;
        page = 0;
        displayPage();
      } else {
        console.log(c.gray('\n  ╔══════════════════════════════════════════════════╗'));
        console.log(c.gray('  ║') + c.cyan('  [f] Filter by HTTP Method') + c.gray('                       ║'));
        console.log(c.gray('  ╠══════════════════════════════════════════════════╣'));
        console.log(c.gray('  ║') + c.white('  Options: ') + c.green('GET') + c.gray(', ') + c.green('POST') + c.gray(', ') + c.green('PUT') + c.gray(', ') + c.green('DELETE') + c.gray(', ') + c.green('PATCH') + c.gray('    ║'));
        console.log(c.gray('  ║') + c.white('  Example: ') + c.green('f GET') + c.gray('  or  ') + c.green('f POST') + c.gray('                     ║'));
        console.log(c.gray('  ╚══════════════════════════════════════════════════╝'));
        process.stdout.write(c.yellow('\n  Enter HTTP method: '));
        const method = await ask('');
        if (method.toUpperCase() === 'ALL' || !method.trim()) {
          filteredRoutes = [...routes];
          searchQuery = '';
        } else {
          filteredRoutes = routes.filter(r => r.method === method.toUpperCase());
          searchQuery = '';
        }
        selectedIndex = 0;
        page = 0;
        displayPage();
      }
    } else if (cmd === 'r' || cmd === 'reset') {
      filteredRoutes = [...routes];
      searchQuery = '';
      selectedIndex = 0;
      page = 0;
      displayPage();
    } else if (cmd === 'h' || cmd === 'help' || cmd === '') {
      displayPage();
    } else {
      displayPage();
    }
  }
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
  if (framework === 'auto') framework = detectFramework(files);
  
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
  
  if (values.json) formatJson(filteredRoutes);
  else if (values.markdown) formatMarkdown(filteredRoutes);
  else {
    const showCode = values.code;
    switch (values.output) {
      case 'list': formatList(filteredRoutes); break;
      case 'tree': formatTree(filteredRoutes); break;
      default: formatTable(filteredRoutes, files, showCode);
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
