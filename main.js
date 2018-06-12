const {app, BrowserWindow, ipcMain} = require("electron");
const fs = require("fs");

var config = {
	"name":"config 1",
	"mode":"steam",
	"version":"64",
	"path":"C:\\Program Files\\KSP_x64"
};

//Load config
fs.readFile('config.txt', 'utf-8' ,function(err, buf) {
	config=(JSON.parse(buf.toString()));
	console.log(config)
});




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
