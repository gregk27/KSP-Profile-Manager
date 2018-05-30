const {app, BrowserWindow} = require("electron");

app.on('ready', function(){
	var window = new BrowserWindow({width:640, height:480})
	window.loadFile("index.html")
})
app.on("browser-window-created",function(e,window) {
	window.setMenu(null);
});

