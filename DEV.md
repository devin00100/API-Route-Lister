---
title: "🚀 API Route Lister - The Ultimate CLI Tool for Discovering API Routes"
published: true
date: "2024-03-24"
tags: ["javascript", "nodejs", "cli", "api", "express"]
excerpt: "Discover all your API endpoints with a single command. Browse, search, filter, and view code directly in your terminal."
cover_image: "https://dev-to-uploads.s3.amazonaws.com/uploads/articles/thumbnails/placeholder.png"
---

# 🚀 API Route Lister - The Ultimate CLI Tool for Discovering API Routes

Ever wondered how many API endpoints your application has? I built a CLI tool that scans your source code and lists all your routes - with code preview, search, and filtering!

## 🎯 What is API Route Lister?

**API Route Lister** is a command-line tool that automatically scans your codebase and discovers all API endpoints. It supports multiple frameworks including Express, Fastify, Next.js, Hapi, and Koa.

### Key Features
- 🔍 **Auto-Detection** - Automatically detects your framework
- 💻 **Code Preview** - View endpoint code directly in CLI
- 🎮 **Interactive Mode** - Browse with keyboard navigation
- 🔎 **Search & Filter** - Find routes by path or HTTP method
- 📊 **Multiple Views** - Table, List, or Tree format
- 📤 **Export** - JSON and Markdown output

## 📦 Installation

```bash
npm install -g api-route-lister
```

## 🚀 Quick Start

```bash
# Scan your source directory
api-route-lister ./src

# Interactive mode
api-route-lister ./src -i

# Tree view with code
api-route-lister ./src -o tree -c
```

## 🎮 Interactive Mode

The interactive mode provides a user-friendly terminal UI:

```bash
api-route-lister ./src -i
```

### Controls
```
[j] Next  [k] Prev  [v] View Code  [g] Go To  [/] Search  [f] Filter  [r] Reset  [q] Quit
```

### Quick Commands
```bash
g 50         # Go to route #50
/ users       # Search for "users"
f GET         # Filter GET routes only
v             # View selected route code
```

## 📊 Example Output

### Table View
```
╔══════════════════════════════════════╗
║      API Route Lister v1.0.7          ║
╚══════════════════════════════════════╝

Found 89 routes in 39 files

METHOD     PATH                     FILE                  LINE
----------------------------------------------------------------------
GET        /api/users               src/routes/users.js   15
POST       /api/users               src/routes/users.js   32
GET        /api/users/:id           src/routes/users.js   48
```

### Tree View
```
api
├── users
│   ├── GET     /api/users
│   ├── POST    /api/users
│   └── :id
│       ├── GET     /api/users/:id
│       ├── PUT     /api/users/:id
│       └── DELETE  /api/users/:id
├── auth
│   └── POST   /api/auth/login
```

## 📋 All Options

| Option | Description |
|--------|-------------|
| `-f, --framework` | Framework (auto, express, fastify, nextjs, hapi, koa) |
| `-o, --output` | Output format (table, list, tree) |
| `-c, --code` | Show endpoint code |
| `-i, --interactive` | Interactive TUI mode |
| `--json` | Output as JSON |
| `-m, --markdown` | Output as Markdown |
| `-F, --filter` | Filter routes by pattern |
| `-v, --verbose` | Show detailed info |

## 🛠️ Built With

- Node.js
- [chalk](https://www.npmjs.com/package/chalk) - Terminal styling
- [ora](https://www.npmjs.com/package/ora) - Terminal spinner

## 📦 Get It Now

```bash
npm install -g api-route-lister
```

Check it out on [npm](https://www.npmjs.com/package/api-route-lister) | [GitHub](https://github.com/devin00100/API-Route-Lister)

---

*Built with ❤️ by [Deepak Ashok Karai](https://github.com/devin00100)*