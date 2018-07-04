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
  // window.toggleDevTools();
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

  var version = "1_4_1"

  //Get config from send data
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

  //If there isn't a CKAN folder in the KSP directory, create an empty one in the profile
  if(!fs.existsSync(location+"\\CKAN")){
    fs.mkdirSync(profilePath+"\\CKAN")
    fs.symlinkSync(profilePath+"\\CKAN", location+"\\CKAN", "junction");
    //Mark as complete
    event.sender.send("complete", "ckan");
  } else{
    //Copy folder to profile
    ncp(location+"\\CKAN", profilePath+"\\CKAN", function(err){
      //Catch failure
      if(err){
        console.log("CKAN FAILED")
        //Mark as failed
        event.sender.send("failed", "ckan");
        return;
      }
      //Otherwise announce completion
      console.log("CKAN COPIED")
      //Delete folder in KSP directory
      rimraf(location+"\\CKAN", [], function(){
        console.log("CKAN DELETED")
        //Mark as complete
        event.sender.send("complete", "ckan");
      });
    })
  }
  //Copy folder to profile
  ncp(location+"\\GameData", profilePath+"\\GameData", function(err){
    //Catch failure
    if(err){
      console.log("GameData FAILED")
      //Mark as failed
      event.sender.send("failed", "gameData");
      event.sender.send("failed", "stock");
      event.sender.send("failed", "dlc");
      return;
    }

    //Copy squad folder
    ncp(profilePath+"\\GameData\\Squad", stockPath+"\\Squad", function(err){
      if(!err){
        rimraf(profilePath+"\\GameData\\Squad", [], function(){
          console.log("Stock DELETED")
          //Mark as complete
          event.sender.send("complete", "squad");
        })
      }
      else {
        event.sender.send("failed", "squad");
      }
    });

    //Copy DLC folders
    if(fs.existsSync(profilePath+"\\GameData\\SquadExpansion")){
      ncp(profilePath+"\\GameData\\SquadExpansion", stockPath+"\\SquadExpansion", function(err){
        if(!err){
          rimraf(profilePath+"\\GameData\\SquadExpansion", [], function(){
            console.log("DLC DELETED")
            //Mark as complete
            event.sender.send("complete", "dlc");
          })
        }
        else {
          event.sender.send("failed", "dlc");
        }
      });
    }
    else{
      fs.mkdirSync(profilePath+"\\GameData\\SquadExpansion");
      event.sender.send("complete", "dlc");
    }


    //Otherwise announce completion
    console.log("GameData COPIED")
    //Delete folder in KSP directory
    rimraf(location+"\\GameData", [],  function(){
      console.log("GameData DELETED")
      //Mark as complete
      event.sender.send("complete", "gameData");
    });
  })
  //Copy folder to profile
  ncp(location+"\\saves", profilePath+"\\saves", function(err){
    //Catch failure
    if(err){
      console.log("saves FAILED")
      //Mark as failed
      event.sender.send("failed", "saves");
      return;
    }
    //Otherwise announce completion
    console.log("saves COPIED")
    //Delete folder in KSP directory
    rimraf(location+"\\saves", [],  function(){
      console.log("saves DELETED")
      //Mark as complete
      event.sender.send("complete", "saves");
    });
  })
})

//Create symlinks to the new profile folders
ipcMain.on("finish-init", function(){
  //Gat path of KSP directory
  var location = config["path"].substr(0, config["path"].lastIndexOf("\\"))

  var version = "1_4_1"

  var profilePath = path+"\\profiles\\"+version+"\\"+config["profile"]["profiles"][config["profile"]["selected"]];

  var stockPath = path+"\\profiles\\"+version+"\\.stock";


  //Wait for 5 seconds to avoid access denied error
  sleep.sleep(5000, function(){
    //Create GameData symlink
    try{
      fs.symlinkSync(profilePath+"\\GameData", location+"\\GameData", "junction");
    }catch (err){
      console.log("GameData symlink failed")
    }
    //Create saves symlink
    try{
      fs.symlinkSync(profilePath+"\\saves", location+"\\saves", "junction");
    } catch(err){
      console.log("saves symlink failed")
    }
    //Create CKAN symlink
    try{
      fs.symlinkSync(profilePath+"\\CKAN", location+"\\CKAN", "junction");
    } catch(err){
      console.log("CKAN symlink failed")
    }
    try{
      fs.symlinkSync(stockPath+"\\Squad", profilePath+"\\Squad", "junction");
    } catch(err){
      console.log("Squad symlink failed")
    }
    try{
      fs.symlinkSync(stockPath+"\\SquadExpansion", profilePath+"\\SquadExpansion", "junction");
    } catch(err){
      console.log("SquadExpansion symlink failed")
    }
    console.log("FINISHED")
    //Load main window to complete installation
    window.loadFile("index.html")
  });
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
ipcMain.on("create-profile", function(event, arg){
  //Add profile
  config["profile"]["profiles"].push(arg)
  //Select profile
  config["profile"]["selected"] = config["profile"]["profiles"].length-1;
  //Update config save
  saveConfig();
  //Create new folders
  var version = "1_4_1"
  var profilePath = path+"\\profiles\\"+version+"\\"+arg;
  var stockPath = path+"\\profiles\\"+version+"\\.stock";
  console.log(profilePath);
  fs.mkdirSync(profilePath);
  fs.mkdirSync(profilePath+"\\GameData");
  fs.mkdirSync(profilePath+"\\saves");
  fs.mkdirSync(profilePath+"\\CKAN");

  fs.symlinkSync(stockPath+"\\Squad", profilePath+"\\GameData\\Squad", "junction");
  fs.symlinkSync(stockPath+"\\SquadExpansion", profilePath+"\\GameData\\SquadExpansion", "junction");

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
  var version = "1_4_1"
  var profilePath = path+"\\profiles\\"+version+"\\"+arg;
  fs.symlinkSync(profilePath+"\\saves", location+"\\saves", 'junction');
  fs.symlinkSync(profilePath+"\\GameData", location+"\\GameData", "junction");
  fs.symlinkSync(profilePath+"\\CKAN", location+"\\CKAN", "junction");
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
