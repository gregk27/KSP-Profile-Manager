const {app, BrowserWindow, ipcMain} = require("electron");
const fs = require("fs");
const { lstatSync, readdirSync } = require('fs')
const { join } = require('path')
const ncp = require("ncp")
const rimraf = require("rimraf")
const sleep  = require("sleep-async")();

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
  //If the config file doesn't exist, run install tool
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
  //Get config from send data
  data=JSON.parse(data)
  config = {
    "mode":data["mode"],
    "version":data["exe"],
    "path":data["path"],
    "profile":{
      "selected":0,
      "profiles":[data["profile"]],
      "versions":[data["version"]]
    }
  };


  var version = data["version"]

  console.log(config);

  //Save the config
  saveConfig();

  //Gat path of KSP directory
  var location = config["path"].substr(0, config["path"].lastIndexOf("\\"))

  //Get path to profile saves
  var profilePath = path+"\\profiles\\"+version+"\\"+data["profile"];
  var stockPath = path+"\\profiles\\"+version+"\\.stock";

  //Create profile foledr
  fs.mkdirSync(path+"\\profiles")
  fs.mkdirSync(path+"\\profiles\\"+version)
  fs.mkdirSync(stockPath)
  fs.mkdirSync(profilePath)

  var folders = JSON.parse(fs.readFileSync("directories.json"))["directories"];

  var tags = [];

  for(var i = 0; i<folders.length; i++){
    tags.push(folders[i]["tag"]);
    for(var j = 0; j<folders[i]["dependents"].length; j++){
      tags.push(folders[i]["dependents"][j]["tag"])
    }
  }

  event.sender.send("generate-progress-indicators", tags)


  for(var i = 0; i<folders.length; i++){
    folder = folders[i];
    moveFolder(folder["tag"], folder["oldPath"], folder["newPath"], folder["dependents"], version, event.sender)
  }

})

//Create symlinks to the new profile folders
ipcMain.on("finish-init", function(event){


  var folders = JSON.parse(fs.readFileSync("directories.json"))["directories"];

  var location = config["path"].substr(0, config["path"].lastIndexOf("\\"))
  // location = location.substr(0, location.lastIndexOf("\\"))

  var version = config["profile"]["versions"][config["profile"]["selected"]];
  var profilePath = path+"\\profiles\\"+version+"\\"+config["profile"]["profiles"][config["profile"]["selected"]];
  profilePath = profilePath.substr(0, profilePath.lastIndexOf("\\"))+"\\Kerbal Space Program"
  console.log("copying")

  ncp(location, profilePath, function(err){
    console.log("Copied")
    rimraf(location, [], function(){
      console.log("deleted")
      sleep.sleep(1000, function(){
        console.log("linking")
        fs.symlinkSync(profilePath, location, "junction")
          event.sender.send("complete", "general")
          console.log("Creating Links")

          for(var i = 0; i<folders.length; i++){
            folder = folders[i];
            createLink(folder["tag"], folder["oldPath"], folder["newPath"], folder["dependents"], event.sender)
            for(var j = 0; j<folder["dependents"].length; j++){
              var subFolder = folder["dependents"][j];
              createLink(subFolder["tag"], subFolder["oldPath"], subFolder["newPath"], subFolder["dependents"], event.sender)
            }
          }

          event.sender.send("complete", "links");
          console.log("Links finished")
        //Load main window to complete installation
        event.sender.send("finished-init");
      })
    })
  })
})

ipcMain.on("finished-init", function(){
  window.loadFile("index.html");
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
    if(saveDirs[i].endsWith("scenarios")||saveDirs[i].endsWith("training")||saveDirs[i].endsWith("missions")) continue;

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
ipcMain.on("create-profile", function(event, arg, version){
  //Add profile
  config["profile"]["profiles"].push(arg)
  config["profile"]["versions"].push(version)
  //Select profile
  config["profile"]["selected"] = config["profile"]["profiles"].length-1;
  //Update config save
  saveConfig();
  //Create new folders
  var location = config["path"].substr(0, config["path"].lastIndexOf("\\"))
  var profilePath = path+"\\profiles\\"+version+"\\"+arg;
  var stockPath = path+"\\profiles\\"+version+"\\.stock";

  console.log(profilePath);
  fs.mkdirSync(profilePath);

  var folders = JSON.parse(fs.readFileSync("directories.json"))["directories"];

  for(var i = 0; i<folders.length; i++){
    folder = folders[i];
    path = folder["newPath"].replace("game", location).replace("profile", profilePath).replace("stock", stockPath)

    fs.mkdirSync(path);
  }

  fs.symlinkSync(stockPath+"\\Squad", profilePath+"\\GameData\\Squad", "junction");
  fs.symlinkSync(stockPath+"\\SquadExpansion", profilePath+"\\GameData\\SquadExpansion", "junction");

  event.sender.send("new-profile-created");
})

//Change location of links
ipcMain.on("change-profile", function(event,arg){
  //Gat path of KSP directory
  var version = config["profile"]["versions"][config["profile"]["selected"]]
  var location = config["path"].substr(0, config["path"].lastIndexOf("\\"))
  var profilePath = path+"\\profiles\\"+version+"\\"+arg;
  var stockPath = path+"\\profiles\\"+version+"\\.stock";

  var folders = JSON.parse(fs.readFileSync("directories.json"))["directories"];

  for(var i = 0; i<folders.length; i++){
    folder = folders[i];
    newPath = folder["newPath"].replace("game", location).replace("profile", profilePath).replace("stock", stockPath)
    oldPath = folder["oldPath"].replace("game", location).replace("profile", profilePath).replace("stock", stockPath);

    fs.rmdirSync(oldPath);
    // sleep.sleep(1000, function(){
      fs.symlinkSync(newPath, oldPath, 'junction');
    // })
  }

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

ipcMain.on("get-versions", function(event){
  var data =getDirectories(path+"\\profiles").replace(/_/g, ".").split(";");
  event.sender.send("get-versions", data.splice(0, data.length-1))
});

//Saves to config to file
function saveConfig(){
  fs.writeFile(path+'\\config.json', JSON.stringify(config), function(err, data){
    if (err) console.log(err);
    console.log("Successfully Written to File.");
  });
}

function createLink(tag, oldPath, newPath, dependents, renderer){
  //Gat path of KSP directory
  var location = config["path"].substr(0, config["path"].lastIndexOf("\\"))

  var version = config["profile"]["versions"][config["profile"]["selected"]];
  var profilePath = path+"\\profiles\\"+version+"\\"+config["profile"]["profiles"][config["profile"]["selected"]];
  var stockPath = path+"\\profiles\\"+version+"\\.stock";


  oldPath = oldPath.replace("game", location).replace("profile", profilePath).replace("stock", stockPath)
  newPath = newPath.replace("game", location).replace("profile", profilePath).replace("stock", stockPath)

  try{
    fs.symlinkSync(newPath, oldPath, "junction");
    console.log("link complete:"+tag)
  }catch (err){
    console.log(tag+" symlink failed")
    renderer.send("failed", "link");
    renderer.send("error", "link-"+tag);
    console.log(err)
  }
}

function moveFolder(tag, oldPath, newPath, dependents, version, renderer){

  //Gat path of KSP directory
  var location = config["path"].substr(0, config["path"].lastIndexOf("\\"))

  //Get path to profile saves
  var profilePath = path+"\\profiles\\"+version+"\\"+config["profile"]["profiles"][config["profile"]["selected"]];
  var stockPath = path+"\\profiles\\"+version+"\\.stock";

  oldPath = oldPath.replace("game", location).replace("profile", profilePath).replace("stock", stockPath)
  newPath = newPath.replace("game", location).replace("profile", profilePath).replace("stock", stockPath)

  //Check if the old path exists
  if(!fs.existsSync(oldPath)){
    //If the old path doesnt exist, only make new path
    fs.mkdirSync(newPath)
    // fs.symlinkSync(newPath, oldPath, "junction");
    //Mark as complete
    renderer.send("complete", tag);
  }
  else{
    //Copy folder to profile
    ncp(oldPath, newPath, function(err){
      //Catch failure
      if(err){
        console.log(tag+" FAILED")
        //Mark as failed
        renderer.send("failed", tag);
        return;
      }
      //Otherwise announce completion
      console.log(tag+" COPIED")
      //Start copying dependents
      for(var i = 0; i<dependents.length; i++){
        var folder = dependents[i];
        moveFolder(folder["tag"], folder["oldPath"], folder["newPath"], folder["dependents"], version, renderer)
      }

      //Delete folder in KSP directory
      rimraf(oldPath, [], function(){
        console.log(tag+" DELETED")
        //Mark as complete
        renderer.send("complete", tag);
      });
    })
  }
}
