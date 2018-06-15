const {app, BrowserWindow, ipcMain} = require("electron");
const fs = require("fs");
const { lstatSync, readdirSync } = require('fs')
const { join } = require('path')

const isDirectory = source => lstatSync(source).isDirectory()
function getDirectories(source, raw){
  var dirList = readdirSync(source).map(name => join(source, name)).filter(isDirectory);
	var dirs = "";

	if(raw) return dirList;

	for(var i = 0; i<dirList.length; i++){
		dirs += dirList[i].replace(source+"\\", "")+";";
	}

	return dirs;
}



var config = {
	"name":"config 1",
	"mode":"steam",
	"version":"64",
	"path":"C:\\Program Files\\KSP_x64"
};

//Load config
fs.readFile('config.txt', 'utf-8', function(err, buf) {
	config=(JSON.parse(buf.toString()));
	console.log(config)
});

//Parses ksp save file to JSON
function parseSFS(path){
	var data = fs.readFileSync(path, "utf-8").replace(/\r/g, "").replace(/\\/g, "\\\\");
		// data = buf.toString()
		data=('{"'+data+'}')
		.replace(/(\) *)=( *\()/g, "$1->$2")
		.replace(/"/g, "'")
		.replace(/{'([A-Z])/g, '{\"$1')
		.replace(/ = */g, '": "')
		.replace(/\n/g, '",\n')
		.replace(/(\t+)/g, '$1"')
		.replace(/\n\t{0}([{,},A-Z])/g, '\n"$1')
		.replace(/^/g, '"')
		.replace(/"{/g, "{" )
		.replace(/{"*,*\n/g, "{\n" )
		.replace(/"}/g, "}" )
		.replace(/}"/g, "}" )
		.replace(/},(\n\t*})/g, "}$1")
		// .replace(/},/g, "}" )
		.replace(/,(\n\t*{)/g, ":$1")
		.replace(/,(\n\t*})/g, "$1");
	// console.log(data.substr(6600,6650));

	fs.writeFile('testOUT.txt', data, function(err, data){
		if (err) console.log(err);
		console.log("Successfully Written to File.");
	});

	return(JSON.parse(data)['GAME'])
}

function commaFormat(num){
  num=""+num;
  out = "";
  for(var i = num.length-1; i>=0; i--){
    out+=num[num.length-i-1];
    if((i%3)==0){
      out+=",";
    }
  }
  return(out.replace(/,$/g, ""));
}

var path = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Kerbal Space Program\\KSP_x64.exe";//"C:\\Windows\\System32\\calc.exe";

var window;

var configWindow;

app.on('ready', function(){
	window = new BrowserWindow({width:640, height:480, frame: false})
	window.loadFile("index.html")
})
app.on("browser-window-created",function(e,window) {
	window.setMenu(null);
	window.toggleDevTools();
});

/*IPC window functions*/{
ipcMain.on('window-min', function (){
	window.minimize();
});

ipcMain.on('window-max', function (){
	if (!window.isMaximized()) {
		window.maximize();
	} else {
		window.unmaximize();
	}
});

ipcMain.on('window-close', function(){
	console.log("close");
	window.close();
});
}

ipcMain.on("window-launch", function(){
	console.log("launch");
	var execFile = require('child_process').execFile, child;
	child = execFile(config["path"], function(error,stdout,stderr) {
		if (error) {
			//console.log(error.stack);
			//console.log('Error code: '+ error.code);
			//console.log('Signal received: '+
			//       error.signal);
		}
		//console.log('Child Process stdout: '+ stdout);
		//console.log('Child Process stderr: '+ stderr);
	});
});

ipcMain.on("window-config", function(){
	configWindow = new BrowserWindow({width:320, height:240, frame: false});
	window.loadFile('config.html');
});

ipcMain.on("set-config", function(event, arg){
	config = arg;
	console.log(config);
	fs.writeFile('config.txt', JSON.stringify(config), function(err, data){
		if (err) console.log(err);
		console.log("Successfully Written to File.");
	});
});

ipcMain.on("request-config", function(event){
	event.sender.send("get-config", config);
})

ipcMain.on("get-mods", function(event){
	event.sender.send("get-mods", getDirectories(config["path"].substr(0, config["path"].lastIndexOf("\\"))+"\\GameData", false));
});

ipcMain.on("get-saves", function(event){
	var saveDirs = getDirectories(config["path"].substr(0, config["path"].lastIndexOf("\\"))+"\\saves", true);

	var saves = [];

	for(var i=0; i<saveDirs.length; i++){
    if(saveDirs[i].endsWith("scenarios")||saveDirs[i].endsWith("training")) continue;

    var data = fs.readFileSync(saveDirs[i]+"\\persistent.sfs", "utf-8").replace(/\r/g, "").replace(/\\/g, "\\\\");

    var title = data.match(/Title = (.*)\(/)[1];
    var mode = data.match(/Mode = (.*)/)[1];
    try{
      var funds = commaFormat(data.match(/funds = (.*)\./)[1]);
    } catch(e){
      var funds = 0;
    }
    try{
      var rep = commaFormat(data.match(/rep = (.*)\./)[1]);
    } catch(e){
      var rep = 0;
    }
    try{
      var science = commaFormat(data.match(/name = ResearchAndDevelopment\n\t*.*\n\t*sci = (.*)\./)[1]);
    } catch(e){
      var science = 0;
    }
    var flights = ""+data.match(/VESSEL\n.*\n.*\n.*\n.*\n\t*type = [^D|F]/g).length

    saves.push({
      "name":title,
      "mode":mode,
      "funds":funds,
      "science":science,
      "reputation":rep,
      "flights":flights
    })
	}
  event.sender.send("get-saves", saves);


})
