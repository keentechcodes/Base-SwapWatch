#!/usr/bin/env node

const { execSync } = require('child_process');
const chalk = require('chalk');

console.log(chalk.cyan.bold('🔨 Building SwapWatch...'));
console.log(chalk.gray('─'.repeat(40)));

try {
  // Run TypeScript compiler with no color output
  execSync('tsc --pretty false', { 
    stdio: ['inherit', 'pipe', 'pipe'],
    encoding: 'utf8'
  });
  
  console.log(chalk.green.bold('✅ Build successful!'));
  console.log(chalk.green('   Output: dist/'));
  console.log(chalk.gray('─'.repeat(40)));
} catch (error) {
  // If there are TypeScript errors, show them in a readable color
  console.log(chalk.red.bold('❌ Build failed with errors:'));
  console.log(chalk.gray('─'.repeat(40)));
  
  // Re-run with pretty output for better error messages
  try {
    execSync('tsc', { stdio: 'inherit' });
  } catch (e) {
    // Errors will be shown by tsc
  }
  process.exit(1);
}