# 🚀 API Route Lister

<div align="center">

![API Route Lister](https://img.shields.io/badge/API-Route%20Lister-6366f1?style=for-the-badge&logo=terminal&logoColor=white)
[![npm version](https://img.shields.io/npm/v/api-route-lister.svg?style=for-the-badge)](https://www.npmjs.com/package/api-route-lister)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)

**The Ultimate CLI Tool to List, Explore & Analyze API Routes from Your Source Code**

*No configuration needed. Just point to your source and discover all your endpoints.*

**Author: Deepak Ashok Karai**

</div>

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔍 **Auto-Detection** | Automatically detects your framework (Express, Fastify, Next.js, Hapi, Koa) |
| 📊 **Multiple Formats** | Table, List, or Tree view for routes |
| 💻 **Code Preview** | View endpoint code directly in CLI with `-c` flag |
| 🎮 **Interactive Mode** | Browse routes with navigation, search, and filtering |
| 🔎 **Powerful Filtering** | Filter routes by path, method, or pattern |
| 📤 **Export Options** | JSON and Markdown output formats |
| 🎨 **Beautiful Output** | Color-coded HTTP methods with modern UI |
| ⚡ **Fast Scanning** | Efficient recursive file scanning |
| 📄 **Pagination** | Navigate large route lists with ease |

---

## 📦 Install

```bash
# Install globally (recommended)
npm install -g api-route-lister

# Or use with npx (no install needed)
npx api-route-lister ./src
```

### Requirements
- Node.js >= 18.0.0
- npm or yarn

---

## 🚀 Quick Start

### Basic Usage
```bash
# Scan current directory
api-route-lister ./src

# Scan specific path
api-route-lister /path/to/your/project/src
```

### View Code
```bash
# Show endpoint code in output
api-route-lister ./src -c

# Filter and show code
api-route-lister ./src -c -F "users"
```

### Interactive Mode
```bash
# Browse routes interactively
api-route-lister ./src -i
```

---

## 🎮 Interactive Mode

The interactive mode provides a user-friendly TUI to browse and explore your API routes.

### Navigation Actions
```
[j] Next  [k] Prev  [v] View Code  [g] Go To  [/] Search  [f] Filter  [r] Reset  [q] Quit
```

### Quick Commands (Single-line)
```bash
g 50          # Go directly to route #50
/ users       # Search for "users"
f GET         # Filter to only GET routes
j             # Move to next route
k             # Move to previous route
v             # View code of selected route
q             # Quit
```

### Guided Actions (2-step with examples)
When you run an action without arguments, you'll see:
```
╔══════════════════════════════════════════════════╗
║  [g] Go To Route Number                              ║
╠══════════════════════════════════════════════════╣
║  Example: g 25  or  g 1                          ║
║  Available: 1 - 89                              ║
╚══════════════════════════════════════════════════╝

  Enter route number: _
```

```
╔══════════════════════════════════════════════════╗
║  [/] Search Routes                                  ║
╠══════════════════════════════════════════════════╣
║  Example: /users  or  /api/v1/*                    ║
║  Supports partial match and patterns              ║
╚══════════════════════════════════════════════════╝

  Enter search text: _
```

```
╔══════════════════════════════════════════════════╗
║  [f] Filter by HTTP Method                       ║
╠══════════════════════════════════════════════════╣
║  Options: GET, POST, PUT, DELETE, PATCH    ║
║  Example: f GET  or  f POST                     ║
╚══════════════════════════════════════════════════╝

  Enter HTTP method: _
```

---

## 🎯 Usage Examples

### Output Formats

```bash
# Table view (default)
api-route-lister ./src -o table

# List view
api-route-lister ./src -o list

# Tree view (hierarchical)
api-route-lister ./src -o tree

# Tree with code preview
api-route-lister ./src -o tree -c
```

### Filter Routes

```bash
# Filter by path pattern
api-route-lister ./src -F "/api/users/*"

# Filter by method
api-route-lister ./src -F "POST"

# Case-insensitive partial match
api-route-lister ./src -F "auth"
```

### Export Options

```bash
# JSON output
api-route-lister ./src --json > routes.json

# Markdown table
api-route-lister ./src -m

# Verbose with details
api-route-lister ./src -v
```

### Framework Options

```bash
# Auto-detect (default)
api-route-lister ./src

# Explicit framework
api-route-lister ./src -f express
api-route-lister ./src -f fastify
api-route-lister ./src -f nextjs
```

---

## 📋 All Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--help` | `-h` | Show help message | - |
| `--framework` | `-f` | Framework: auto, express, fastify, nextjs, hapi, koa | auto |
| `--output` | `-o` | Output format: table, list, tree | table |
| `--json` | - | Output as JSON | - |
| `--markdown` | `-m` | Output as Markdown table | - |
| `--filter` | `-F` | Filter routes by pattern | - |
| `--code` | `-c` | Show endpoint code | - |
| `--interactive` | `-i` | Interactive TUI mode | - |
| `--verbose` | `-v` | Show detailed information | - |
| `--no-color` | - | Disable colors | - |

---

## 🎨 Example Output

### Table View
```
╔══════════════════════════════════════╗
║      API Route Lister v1.0.5          ║
╚══════════════════════════════════════╝

Found 89 routes in 39 files

Framework: EXPRESS

METHOD     PATH                                               FILE                                     LINE
--------------------------------------------------------------------------------------------------------------
GET        /api/users                                         src/routes/users.js                       15
POST       /api/users                                         src/routes/users.js                       32
GET        /api/users/:id                                     src/routes/users.js                       48
PUT        /api/users/:id                                     src/routes/users.js                       65
DELETE     /api/users/:id                                     src/routes/users.js                       82
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
│   ├── POST   /api/auth/login
│   └── POST   /api/auth/logout
└── products
    ├── GET     /api/products
    └── POST    /api/products
```

### Interactive Mode
```
╔══════════════════════════════════════╗
║      API Route Lister v1.0.5          ║
╚══════════════════════════════════════╝
API Route Lister | 89 routes | Page 1/3

  1. > POST    /challenge
  2.   POST    /login
  3.   GET     /me
  4.   GET     /users
  5.   POST    /users
  ...

────────────────────────────────────────────────────────────
[j] Next  [k] Prev  [v] View Code  [g] Go To  [/] Search  [f] Filter  [r] Reset  [q] Quit
```

### Code View (in Interactive Mode)
```
╔══════════════════════════════════════╗
║      API Route Lister v1.0.5          ║
╚══════════════════════════════════════╝

  Method: POST
  Path:   /challenge
  File:   src/routes/auth.routes.js:24

  CODE:

────────────────────────────────────────────────────────────
  24 | router.post("/challenge", (req, res) => {
  25 |   const { username } = req.body;
  26 |   if (!username) return res.status(400).json({ error: "MISSING_USERNAME" });
  27 | 
  28 |   const nonce = createLoginChallenge(username);
  29 |   if (!nonce) return res.status(404).json({ error: "USER_NOT_FOUND" });
  30 | 
  31 |   res.json({ nonce });
  32 | });
────────────────────────────────────────────────────────────
  b - Back to list
```

---

## 🔧 Supported Frameworks

- **Express.js** - Most popular Node.js framework
- **Fastify** - Fast, low-overhead web framework
- **Next.js** - API routes in Next.js applications
- **Hapi** - Rich framework for Node.js
- **Koa** - Expressive middleware for Node.js

---

## 🛠️ Development

```bash
# Clone the repository
git clone <repo-url>
cd api-route-lister

# Install dependencies
npm install

# Link for local testing
npm link

# Run locally
node bin/cli.js ./src
```

---

## 🤝 Contributing

Contributions are welcome! Feel free to submit issues and pull requests.

---

## 📄 License

MIT License - feel free to use it in your projects!

---

## 🙏 Acknowledgments

Built with ❤️ by **Deepak Ashok Karai**

Using Node.js and these amazing packages:
- [chalk](https://www.npmjs.com/package/chalk) - Terminal string styling
- [ora](https://www.npmjs.com/package/ora) - Elegant terminal spinner

---

<div align="center">

**Made with ❤️ for developers who love clean APIs**

*If you find this useful, star the repo! ⭐*

</div>
