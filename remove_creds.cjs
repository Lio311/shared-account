const fs = require('fs');
const path = require('path');

const secretString = "";
const justString = "process.env.DATABASE_URL";

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDirectory(fullPath);
    } else {
      if (fullPath.endsWith('.mjs') || fullPath.endsWith('.cjs') || fullPath.endsWith('.js') || fullPath.includes('.env.deploy')) {
        let content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes(secretString) || content.includes(justString)) {
          console.log('Fixing:', fullPath);
          content = content.split(secretString).join('');
          
          if (content.includes(justString)) {
             if (fullPath.includes('.env.deploy')) {
               content = content.split(justString).join('""'); // or remove
             } else {
               content = content.split(justString).join('process.env.DATABASE_URL');
             }
          }
          
          fs.writeFileSync(fullPath, content);
        }
      }
    }
  }
}

processDirectory(__dirname);
