const fs=require('fs'),path=require('path'),vm=require('vm');
function check(dir){for(const file of fs.readdirSync(dir)){const p=path.join(dir,file);if(fs.statSync(p).isDirectory())check(p);else if(file.endsWith('.js'))new vm.Script(fs.readFileSync(p,'utf8'),{filename:p});else if(file.endsWith('.json'))JSON.parse(fs.readFileSync(p,'utf8'));}}
check('miniprogram');check('cloudfunctions');JSON.parse(fs.readFileSync('project.config.json','utf8'));console.log('JavaScript and JSON checks passed');
