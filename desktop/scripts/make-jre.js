const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const modules = [
  'java.base',
  'java.logging',
  'java.sql',
  'java.naming',
  'java.net.http',
  'java.desktop',
  'java.xml',
  'java.management',
  'java.security.jgss',
  'java.instrument',
  'jdk.unsupported',
  'jdk.crypto.ec'
].join(',')

const JavaHome = process.env.JAVA_HOME || 'E:\\JDK11'
const jlink = path.join(JavaHome, 'bin', 'jlink.exe')
const output = path.join(__dirname, '..', 'build', 'jre')

if (!fs.existsSync(jlink)) {
  throw new Error(`jlink not found: ${jlink}`)
}
fs.rmSync(output, { recursive: true, force: true })
execFileSync(jlink, [
  '--add-modules', modules,
  '--output', output,
  '--strip-debug',
  '--no-header-files',
  '--no-man-pages',
  '--compress=2'
], { stdio: 'inherit' })

console.log(`[jre] ${output}`)
