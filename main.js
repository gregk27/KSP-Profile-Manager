const {app, BrowserWindow, ipcMain} = require("electron");
const fs = require("fs");
const { lstatSync, readdirSync } = require('fs')
const { join } = require('path')
const ncp = require("ncp")
const rimraf = require("rimraf")

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
if(fs.existsSync(path+"\\config.json")){
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
}

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
  if(fs.existsSync(path+'\\config.json'))
    window.loadFile("index.html")
  else
    window.loadFile("setup.html")

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

//Initial configuration
ipcMain.on('initialize', function(event, data){
  data=JSON.parse(data)
  config = {
    "mode":data["mode"],
    "version":data["version"],
    "path":data["path"],
    "profile":{
      "selected":0,
      "profiles":[data["profile"]]
    }
  };

  console.log(config);

  saveConfig();

  //Gat path of KSP directory
  var location = config["path"].substr(0, config["path"].lastIndexOf("\\"))

  var profilePath = path+"\\profiles\\"+data["profile"];

  fs.mkdirSync(path+"\\profiles")
  fs.mkdirSync(profilePath)


  if(!fs.existsSync(location+"\\CKAN")){
    fs.mkdirSync(profilePath+"\\CKAN")
    fs.symlinkSync(profilePath+"\\CKAN", location+"\\CKAN", "junction");
    event.sender.send("ckan-complete");
  } else{
    ncp(location+"\\CKAN", profilePath+"\\CKAN", function(err){
      console.log(fs.existsSync(profilePath+"\\CKAN"))
      console.log(profilePath+"\\CKAN"+"<-"+location+"\\CKAN")
      rimraf.sync(location+"\\CKAN");
      // fs.symlinkSync(profilePath+"\\CKAN", location+"\\CKAN", "junction");
      event.sender.send("ckan-complete");
    })
  }
  ncp(location+"\\GameData", profilePath+"\\GameData", function(err){
    console.log(fs.existsSync(profilePath+"\\GameData"))
    console.log(profilePath+"\\GameData"+"<-"+location+"\\GameData")
    rimraf.sync(location+"\\GameData");
    // fs.symlinkSync(profilePath+"\\saves", location+"\\saves", "junction");
    event.sender.send("gamedata-complete");
  })
  ncp(location+"\\saves", profilePath+"\\saves", function(err){
    console.log(fs.existsSync(profilePath+"\\saves"))
    console.log(profilePath+"\\saves"+"<-"+location+"\\saves")
    rimraf.sync(location+"\\saves");
    // fs.symlinkSync(profilePath+"\\saves", location+"\\saves", "junction");
    event.sender.send("saves-complete");
  })
})

ipcMain.on("finish-init", function(){
  console.log("FINISHED")
  window.loadFile("index.html")
})

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

//Create new profile
ipcMain.on("create-profile", function(event, arg){
  //Add profile
  config["profile"]["profiles"].push(arg)
  //Select profile
  config["profile"]["selected"] = config["profile"]["profiles"].length-1;
  //Update config save
  saveConfig();
  //Create new folders
  console.log(path+"\\profiles\\"+arg);
  fs.mkdirSync(path+"\\profiles\\"+arg);
  fs.mkdirSync(path+"\\profiles\\"+arg+"\\GameData");
  fs.mkdirSync(path+"\\profiles\\"+arg+"\\saves");
  fs.mkdirSync(path+"\\profiles\\"+arg+"\\CKAN");
  event.sender.send("new-profile-created");
})

//Change location of links
ipcMain.on("change-profile", function(event,arg){
  //Gat path of KSP directory
  var location = config["path"].substr(0, config["path"].lastIndexOf("\\"))
  //Delete old links
  fs.rmdirSync(location+"\\saves")
  fs.rmdirSync(location+"\\GameData")
  fs.rmdirSync(location+"\\CKAN")
  //Create new links
  fs.symlinkSync(path+"\\profiles\\"+arg+"\\saves", location+"\\saves", 'junction');
  fs.symlinkSync(path+"\\profiles\\"+arg+"\\GameData", location+"\\GameData", "junction");
  fs.symlinkSync(path+"\\profiles\\"+arg+"\\CKAN", location+"\\CKAN", "junction");
  event.sender.send("refresh");
})

//Renames a profile and associated folders
ipcMain.on("rename-profile", function(event, oldName, newName){
  //Rename in config
  config["profile"]["profiles"][config["profile"]["profiles"].indexOf(oldName)] = newName;
  saveConfig();
  //Rename folder
  fs.renameSync(path+"\\profiles\\"+oldName, path+"\\profiles\\"+newName);
  event.sender.send("profile-renamed", newName);
})

//Saves to config to file
function saveConfig(){
  fs.writeFile(path+'\\config.json', JSON.stringify(config), function(err, data){
    if (err) console.log(err);
    console.log("Successfully Written to File.");
  });
}
