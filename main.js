const {app, BrowserWindow, ipcMain} = require("electron");
const fs = require("fs");
const { lstatSync, readdirSync } = require('fs')
const { join } = require('path')

//Check if path leads to directory
function isDirectory(source){
  return(lstatSync(source).isDirectory());
}
//Get subdirecotries, if raw is true, paths will be included
function getDirectories(source, raw){
  var dirList = readdirSync(source).map(name => join(source, name)).filter(isDirectory);
  var dirs = "";

  if(raw) return dirList;

  //Remove directory paths
  for(var i = 0; i<dirList.length; i++){
    dirs += dirList[i].replace(source+"\\", "")+";";
  }

  return dirs;
}

//Default config
var config = {
  "mode":"steam",
  "version":"64",
  "path":"C:\\Program Files (x86)\\Steam\\steamapps\\common\\Kerbal Space Program\\KSP_x64.exe",
  "profile":{
    "selected":0,
    "profiles":["Test"]
  }
};

var path = app.getPath('userData')

console.log(path+"\\config.json");

//Load config
fs.readFile(path+'\\config.json', 'utf-8', function(err, buf) {
  try{
    var data = JSON.parse(buf.toString());
    config=data;
    console.log(config)
  } catch(e){
    console.log("Config not found, reverting to default")
    fs.writeFile(path+'\\config.json', JSON.stringify(config), function(err, data){
      if (err) console.log(err);
      console.log("Successfully Written to File.");
    });
  }
});

console.log(config["profile"]["profiles"][config["profile"]["selected"]])

//Parses ksp save file to JSON
function parseSFS(path){
  //Load save file
  var data = fs.readFileSync(path, "utf-8").replace(/\r/g, "").replace(/\\/g, "\\\\");

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
  .replace(/,(\n\t*{)/g, ":$1")
  .replace(/,(\n\t*})/g, "$1");

  return(JSON.parse(data)['GAME'])
}

//Add commas to seperate thousands
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

// var path = "C:\\Users\\P\\AppData\\Roaming\\KSP profiles"
var window;


app.on('ready', function(){
  window = new BrowserWindow({width:640, height:480, frame: false})
  window.loadFile("index.html")
})
app.on("browser-window-created",function(e,window) {
  window.setMenu(null);
  window.toggleDevTools();
});

//IPC window functions
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

//Launch KSP
ipcMain.on("window-launch", function(){
  console.log("launch");
  var execFile = require('child_process').execFile, child;
  child = execFile(config["path"], function(error,stdout,stderr) {
    if (error) {
    }
  });
});

//Write config data to file
ipcMain.on("set-config", function(event, arg){
  config["mode"]=arg["mode"];
  config["version"]=arg["version"];
  config["path"]=arg["path"];
  fs.writeFile(path+'\\config.json', JSON.stringify(config), function(err, data){
    if (err) console.log(err);
    console.log("Successfully Written to File.");
  });
});

//Send config to renderer
ipcMain.on("request-config", function(event){
  event.sender.send("get-config", config);
})

//Send mods to renderer
ipcMain.on("get-mods", function(event){
  event.sender.send("get-mods", getDirectories(config["path"].substr(0, config["path"].lastIndexOf("\\"))+"\\GameData", false));
});

//Send saves and metadata to renderer
ipcMain.on("get-saves", function(event){
  //Get list of save games
  var saveDirs = getDirectories(config["path"].substr(0, config["path"].lastIndexOf("\\"))+"\\saves", true);

  var saves = [];

  for(var i=0; i<saveDirs.length; i++){
    //Ignore sceanrio and training folders
    if(saveDirs[i].endsWith("scenarios")||saveDirs[i].endsWith("training")) continue;

    //Read save file
    var data = fs.readFileSync(saveDirs[i]+"\\persistent.sfs", "utf-8").replace(/\r/g, "").replace(/\\/g, "\\\\");

    //Get title from save
    var title = data.match(/Title = (.*)\(/)[1];
    //Get mode from save
    var mode = data.match(/Mode = (.*)/)[1];
    //Get funds
    try{
      var funds = commaFormat(data.match(/funds = (.*)\./)[1]);
    } catch(e){
      var funds = 0;
    }
    //Get science
    try{
      var rep = commaFormat(data.match(/rep = (.*)\./)[1]);
    } catch(e){
      var rep = 0;
    }
    //Get reputation
    try{
      var science = commaFormat(data.match(/name = ResearchAndDevelopment\n\t*.*\n\t*sci = (.*)\./)[1]);
    } catch(e){
      var science = 0;
    }
    //Get flights not marked as Debris or Probe
    var flights = ""+data.match(/VESSEL\n.*\n.*\n.*\n.*\n\t*type = [^D|F]/g).length

    //Add JSON to saves
    saves.push({
      "name":title,
      "mode":mode,
      "funds":funds,
      "science":science,
      "reputation":rep,
      "flights":flights
    })
  }
  //Send to renderer
  event.sender.send("get-saves", saves);
})

//Send profile data to renderer
ipcMain.on("get-profiles", function(event){
  event.sender.send("get-profiles", JSON.stringify(config["profile"]));
})


ipcMain.on("create-profile", function(event, arg){
  config["profile"]["profiles"].push(arg)
  config["profile"]["selected"] = config["profile"]["profiles"].length-1;
  fs.writeFile(path+'\\config.json', JSON.stringify(config), function(err, data){
    if (err) console.log(err);
    console.log("Successfully Written to File.");
  });
  console.log(path+"\\profiles\\"+arg);
  fs.mkdirSync(path+"\\profiles\\"+arg);
  fs.mkdirSync(path+"\\profiles\\"+arg+"\\GameData");
  fs.mkdirSync(path+"\\profiles\\"+arg+"\\saves");
  event.sender.send("new-profile-created");
})


ipcMain.on("change-profile", function(event,arg){
  var location = config["path"].substr(0, config["path"].lastIndexOf("\\"))
  fs.rmdirSync(location+"\\saves")
  fs.rmdirSync(location+"\\GameData")
  fs.symlinkSync(path+"\\profiles\\"+arg+"\\saves", location+"\\saves", 'junction');
  fs.symlinkSync(path+"\\profiles\\"+arg+"\\GameData", location+"\\GameData", "junction");
  event.sender.send("update-saves");
  event.sender.send("update-mods");
})
