const {app, BrowserWindow, ipcMain} = require("electron");

var window;

app.on('ready', function(){
	window = new BrowserWindow({width:640, height:480, frame: false})
	window.loadFile("index.html")
})
app.on("browser-window-created",function(e,window) {
	window.setMenu(null);
	window.toggleDevTools();
});




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