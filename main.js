const {app, BrowserWindow, ipcMain, shell} = require("electron");
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
  "path":"C:\\Program Files (x86)\\Steam\\steamapps\\common\\Kerbal Space Program\\KSP_x64.exe",
  "CKAN":"",
  "loaded":0,
  "profiles":[{"name":"test", "version":"1_4_1"}]
};

//List of the directories that are profile specific
var directories = [
  {
    "tag":"CKAN",
    "oldPath":"game\\CKAN",
    "newPath":"profile\\CKAN",
    "dependents":[]
  },
  {
    "tag":"Saves",
    "oldPath":"game\\saves",
    "newPath":"profile\\saves",
    "dependents":[]
  },
  {
    "tag":"Ships",
    "oldPath":"game\\ships",
    "newPath":"profile\\ships",
    "dependents":[]
  },
  {
    "tag":"Mods",
    "oldPath":"game\\GameData",
    "newPath":"profile\\GameData",
    "dependents":[
      {
        "tag":"Stock",
        "oldPath":"profile\\GameData\\Squad",
        "newPath":"stock\\Squad",
        "dependents":[]
      },
      {
        "tag":"DLC",
        "oldPath":"profile\\GameData\\SquadExpansion",
        "newPath":"stock\\SquadExpansion",
        "dependents":[]
      }
    ]
  }
]

var path = app.getPath('userData')

console.log(path+"\\config.json");

//Load config
if(fs.existsSync(path+"\\config.json")){
  getConfig();
}

function getConfig(){
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

console.log(config["profiles"][config["loaded"]]["name"])


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
  window = new BrowserWindow({width:1280, height:1024, frame: false})
  //If the config file doesn't exist, run install tool
  if(fs.existsSync(path+'\\config.json'))
    window.loadFile("index.html")
  else
    window.loadFile("setup.html")

})

app.on("browser-window-created",function(e,window) {
  window.setMenu(null);
  //window.toggleDevTools();
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
  window.removeAllListeners('close');
  window.close();
  sleep.sleep(500, function(){
    app.quit();
  })
});


//Initial configuration
ipcMain.on('initialize', function(event, data){
  //Get config from send data
  config = data;

  version = config["profiles"][0]["version"]
  if(version=="AUTO"){
    var regex = /[\n\r]Version (\S+)[\n\r]/g;
    version=regex.exec(fs.readFileSync("C:\\Steam\\steamapps\\common\\Kerbal Space Program\\readme.txt").toString())[1].replace("/./g", "_");
    console.log(version)
    config["profiles"][0]["version"] = version;
  }

  console.log(config);

  //Save the config
  saveConfig();

  //Gat path of KSP directory
  var location = config["path"].substr(0, config["path"].lastIndexOf("\\"))

  //Get path to profile saves
  var profilePath = path+"\\profiles\\"+version+"\\"+data["profiles"][0]["name"];
  var stockPath = path+"\\profiles\\"+version+"\\.stock";

  //Create profile foledr
  fs.mkdirSync(path+"\\profiles")
  fs.mkdirSync(path+"\\profiles\\"+version)
  fs.mkdirSync(stockPath)
  fs.mkdirSync(profilePath)

  var folders = directories;

  var tags = [];

  //Get the tags for the completion indicators
  for(var i = 0; i<folders.length; i++){
    tags.push(folders[i]["tag"]);
    for(var j = 0; j<folders[i]["dependents"].length; j++){
      tags.push(folders[i]["dependents"][j]["tag"])
    }
  }

  event.sender.send("generate-progress-indicators", tags)

  //Move the required folders
  for(var i = 0; i<folders.length; i++){
    folder = folders[i];
    moveFolder(folder["tag"], folder["oldPath"], folder["newPath"], folder["dependents"], version, event.sender)
  }

})

//Create symlinks to the new profile folders
ipcMain.on("finish-init", function(event){


  var folders = directories;

  var location = config["path"].substr(0, config["path"].lastIndexOf("\\"))
  // location = location.substr(0, location.lastIndexOf("\\"))

  var version = config["profiles"][config["loaded"]]["version"];
  var profilePath = path+"\\profiles\\"+version+"\\"+config["profiles"][config["loaded"]]["name"];
  profilePath = profilePath.substr(0, profilePath.lastIndexOf("\\"))+"\\Kerbal Space Program"
  console.log("copying")

  //Copy KSP files
  ncp(location, profilePath, function(err){
    console.log(err)
    console.log("Copied")
    //Delete old KSP files
    rimraf(location, [], function(err){
      console.log(err)
      console.log("deleted")
      //Delay to ensure that deletion is complete
      sleep.sleep(1000, function(){
        console.log("linking")
        //Link the KSP files to the old location
        fs.symlinkSync(profilePath, location, "junction")
        event.sender.send("complete", "general")
        console.log("Creating Links")
        //Create the links for the required folders
        for(var i = 0; i<folders.length; i++){
          folder = folders[i];
          createLink(folder["tag"], folder["oldPath"], folder["newPath"], folder["dependents"], event.sender)
          //Create the links for the subfolders
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

//Change the page the window is displaying
ipcMain.on("finished-init", function(){
  window.loadFile("index.html");
});

//Launch KSP
ipcMain.on("window-launch", function(){
  console.log("launch");
  let execFile = require('child_process').execFile, child;
  child = execFile(config["path"], function(error,stdout,stderr) {
    if (error) {
    }
  });
});

ipcMain.on("launch-ckan", function(){
  console.log("launch");
  let execFile = require('child_process').execFile, child;
  child = execFile(config["CKAN"], function(error,stdout,stderr) {
    if (error) {
    }
  });
});

ipcMain.on("get-config", function(event, callback){
  event.sender.send(callback, config)
});

//Write config data to file
ipcMain.on("set-config", function(event, arg){
  config["path"]=arg["path"];
  config["CKAN"]=arg["CKAN"];
  console.log(arg["CKAN"])
  saveConfig();
});

//Send config to renderer
ipcMain.on("request-config", function(event){
  event.sender.send("get-config", config);
})

//Send mods to renderer
function getMods(profile){
  console.log(getDirectories(path+"\\profiles\\"+profile["version"]+"\\"+profile["name"]+"\\GameData", false));
  return getDirectories(path+"\\profiles\\"+profile["version"]+"\\"+profile["name"]+"\\GameData", false).split(";");
};

//Send saves and metadata to renderer
function getSaves(profile){
  //Get list of save games
  var saveDirs = getDirectories(path+"\\profiles\\"+profile["version"]+"\\"+profile["name"]+"\\saves", true);

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
    console.log("SAVE:")
    console.log(saves);
  }
  //Send to renderer
  return saves;
}


function getProfiles(){
  // Profile Data structure:
  // {
  //   "name":"Career",
  //   "version":"1.4.1",
  //   "mods":[
  //     "CKAN",
  //     "Game Data",
  //     "Mechjeb",
  //     "Kerbal engineer redux"
  //   ],
  //   "saves"[
  //     {
  //       "name":"Save 1",
  //       "mode":"CAREER",
  //       "flights":"100",
  //       "funds":"100",
  //       "science":"100",
  //       "reputation":"100"
  //     }
  //   ]
  // }
  profiles = [];
  for(var i=0; i<config["profiles"].length; i++){
    profile = config["profiles"][i];
    console.log(profile)
    var out = {
      "name":profile["name"],
      "version":profile["version"].replace(/_/g, "."),
      "mods":null,
      "saves":null
    }
    console.log(out)
    out.mods = getMods(profile);
    console.log(out)
    console.log(getSaves(profile))
    out.saves = getSaves(profile);
    console.log(out)
    profiles.push(out);
  }
  return profiles;
}
//Send profile data to renderer
ipcMain.on("get-profiles", function(event){
  event.sender.send("get-profiles", getProfiles(), config["loaded"]);
})

//Create new profile
ipcMain.on("create-profile", function(event, arg, version){
  //Add profile
  config["profiles"].push({"name":arg, "version":version})
  //Select profile
  config["loaded"] = config["profiles"].length-1;
  //Update config save
  saveConfig();
  //Create new folders
  var location = config["path"].substr(0, config["path"].lastIndexOf("\\"))
  var profilePath = path+"\\profiles\\"+version+"\\"+arg;
  var stockPath = path+"\\profiles\\"+version+"\\.stock";

  console.log(profilePath);
  fs.mkdirSync(profilePath);

  var folders = directories

  //Create required folders
  for(var i = 0; i<folders.length; i++){
    folder = folders[i];
    var newPath = folder["newPath"].replace("game", location).replace("profile", profilePath).replace("stock", stockPath)

    fs.mkdirSync(newPath);
  }

  //Make symlinks fpr main folders
  fs.symlinkSync(stockPath+"\\Squad", profilePath+"\\GameData\\Squad", "junction");
  fs.symlinkSync(stockPath+"\\SquadExpansion", profilePath+"\\GameData\\SquadExpansion", "junction");

  event.sender.send("new-profile-created");
})

//Counter for completed steps when changing profiles
changeCount = 0;

//Change profiles
ipcMain.on("change-profile", function(event,arg){
  changeCount = 0;
  var oldVersion = config["profiles"][config["loaded"]]["version"];
  config["loaded"] = arg;
  saveConfig();
  //Gat path of KSP directory
  var version = config["profiles"][config["loaded"]]["version"]
  var location = config["path"].substr(0, config["path"].lastIndexOf("\\"))
  var gameLocation = path+"\\profiles\\"+version+"\\Kerbal Space Program";
  var profilePath = path+"\\profiles\\"+version+"\\"+config["profiles"][arg]["name"];
  var stockPath = path+"\\profiles\\"+version+"\\.stock";
  console.log(profilePath)
  console.log(location)
  console.log(stockPath)
  console.log(gameLocation)

  //Change versions if needed
  if(version!=oldVersion){
    console.log("change version")
    //Delete old link
    rimraf(location, [], function(){
      //Make new link
      fs.symlinkSync(gameLocation, location, "junction");
      changeProfileRefresh(event.sender)
    })
  }
  else{
    changeProfileRefresh(event.sender)
  }

  var folders = directories

  for(var i = 0; i<folders.length; i++){
    folder = folders[i];

    //Get paths
    newPath = folder["newPath"].replace("profile", profilePath).replace("stock", stockPath).replace("game", gameLocation);
    oldPath = folder["oldPath"].replace("profile", profilePath).replace("stock", stockPath).replace("game", gameLocation);

    //If the folder to be replaced doesn't exist, don't worry
    try{
      fs.rmdirSync(oldPath);
    }catch(err){
      console.log(err);
    }
    //Make the new links
    console.log(oldPath)
    console.log(newPath)
    fs.symlinkSync(newPath, oldPath, 'junction');
  }
  changeProfileRefresh(event.sender)

})

//Count the completed steps when changing profiles
function changeProfileRefresh(renderer){
  changeCount++;
  if(changeCount==2)  renderer.send("refresh");
}

//Renames a profile and associated folders
ipcMain.on("edit-profile", function(event, index, newName){
  var oldName = config["profiles"][index]["name"];
  var version = config["profiles"][index]["version"];
  //Rename in config
  config["profiles"][index]["name"] = newName;
  saveConfig();
  //Rename folder
  fs.renameSync(path+"\\profiles\\"+version+"\\"+oldName, path+"\\profiles\\"+version+"\\"+newName);
  event.sender.send("refresh");
})

ipcMain.on("get-versions", function(event){
  var data = getDirectories(path+"\\profiles").replace(/_/g, ".").split(";");
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

  var version = config["profiles"][config["loaded"]]["version"];
  var profilePath = path+"\\profiles\\"+version+"\\"+config["profiles"][config["loaded"]]["name"];
  var stockPath = path+"\\profiles\\"+version+"\\.stock";

  //Get the paths
  oldPath = oldPath.replace("game", location).replace("profile", profilePath).replace("stock", stockPath)
  newPath = newPath.replace("game", location).replace("profile", profilePath).replace("stock", stockPath)

  try{
    //Create the link
    fs.symlinkSync(newPath, oldPath, "junction");
    console.log("link complete:"+tag)
  }catch (err){
    //Report the error
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
  var profilePath = path+"\\profiles\\"+version+"\\"+config["profiles"][config["loaded"]]["name"];
  var stockPath = path+"\\profiles\\"+version+"\\.stock";

  oldPath = oldPath.replace("game", location).replace("profile", profilePath).replace("stock", stockPath)
  newPath = newPath.replace("game", location).replace("profile", profilePath).replace("stock", stockPath)

  console.log(oldPath)
  //Check if the old path exists
  if(!fs.existsSync(oldPath)){
    console.log("Does not exist "+tag)
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

ipcMain.on("report", function(){
	shell.openExternal("https://github.com/Aree-Vanier/KSP-Profile-Manager/issues");
})

ipcMain.on("uninstall", function(event, output){
  let location = config["path"].substr(0, config["path"].lastIndexOf("\\"));
  let profileCount = config["profiles"].length;
  //4 steps per profile plus initial step
  event.sender.send("set-progress", 0, profileCount*6);
  //Delete the main simlink
  rimraf(location, [], function(){
    for(let p=0; p<profileCount; p++){
      profile = config["profiles"][p];
      let profilePath = path+"\\profiles\\"+profile["version"]+"\\"+profile["name"];
      let stockPath = path+"\\profiles\\"+profile["version"]+"\\.stock";
      let newPath = output+"\\"+profile["name"]+" -- "+profile["version"];
      let kspPath = path+"\\profiles\\"+profile["version"]+"\\Kerbal Space Program";

      event.sender.send("set-progress", 1,0);
      rimraf(kspPath+"\\GameData", [], function(){
        rimraf(kspPath+"\\saves", [], function(){
          rimraf(kspPath+"\\ships", [], function(){
            rimraf(kspPath+"\\CKAN", [], function(){
              event.sender.send("set-progress", 1, 0);
              //Copy KSP files
              ncp(kspPath, newPath, function(err){
                console.log(err);
                console.log("KSP copied")
                event.sender.send("set-progress", 1, 0);
                //Copy profile folders
                ncp(profilePath, newPath, function(err){
                  console.log(err);
                  console.log("Profile copied")
                  event.sender.send("set-progress", 1, 0);
                  //Copy stock folders
                  ncp(stockPath, newPath+"\\GameData", function(err){
                    console.log(err);
                    console.log("Stock copied")
                    event.sender.send("set-progress", 1, 0);
                  })
                  //Delete profile folders
                  rimraf(profilePath, [], function(err){
                    console.log(err);
                    console.log("Profile deleted")
                    event.sender.send("set-progress", 1, 0);
                  })
                })
              })
            })
          })
        })
      })
    }
    fs.mkdirSync(location);
  })
})
