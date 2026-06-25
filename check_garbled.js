const fs = require('fs');
const content = fs.readFileSync('e:/vivpr/ai/lie/webapp/mobile.html', 'utf8');
const lines = content.split('\n');
const bad = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // Check for garbled patterns: Chinese/special chars mixed with question marks
  const hasGarble = /[\u6e32\u5a04\u9057\u8af8\u786c\u6028\u6d39\u91c9\u5a92\u5241\uc8cd\uc724\ud558\ud685\ub7ec\ub294\uc774]/.test(line) ||
    /\?[^\s<>"'=\u0041-\u007a\u0030-\u0039]{2,}/.test(line);
  if (hasGarble) {
    bad.push(i+1 + ': ' + line.trim().substring(0,180));
  }
}
console.log('Remaining garbled lines: ' + bad.length);
bad.forEach(b => console.log(b));
