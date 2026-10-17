const fs = require('node:fs')
const path = require('node:path')

const electronRoot = path.join(__dirname, '..', 'node_modules', 'electron')
const pathFile = path.join(electronRoot, 'path.txt')

if (fs.existsSync(pathFile)) {
  process.exit(0)
}

if (!process.env.ELECTRON_MIRROR) {
  process.env.ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
}

require(path.join(electronRoot, 'install.js'))
