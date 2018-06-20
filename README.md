# KSP Profile Manager
A software utility to simplify the managing of Kerbal Space Program mod profiles.

Each profile has it's own:
  - Saves folder
  - GameData folder
  - CKAN folder
  
This allows you to have one set of mods for your career, and a seperate set of mods for your sandbox.

# Installation
Installation is easy!

Step 1: Get the [newest release](https://github.com/Aree-Vanier/KSP-Profile-Manager/releases)

Step 2: **BACK UP YOUR SAVES** (and possibly mods). While it shouldn't happen, saves may be damaged by the install process

Step 3: Run `KSP-Profile-Manager.exe`

Step 4: Enter the required information on the installation page

[IMAGE OF INSTALL PAGE]

Step 5: Wait for the installation process. This may take some time as it has to copy all mods and saves.

Your installation is complete!

# Creating a profile
To create a profile, click the `New Profile` button in the top left.

Enter a name for the new profile and click continue

Click load to load the new profile

## Adding squad folder to new profile

To add the squad folder to a new profile, go to an existing profile (saved in appdata\Roaming\KSP-Profile-Manager\profiles) and copy the squad folder (in GameData) to the new profile

# Selecting a profile
Select the profile you want to load and click load

# Mod conflicts
There should be no mod conflicts, as no mods run outside of the KSP environment. The profile manager is compatible with CKAN.

There is currently no proper support for KSP updates, however adding support is a high priority.

There is currently only support for windows computers, because I have no means of testing on a mac, and have not yet tested on linux.

# Reporting bugs
This is still in a developmental phase. If you encouter any error, or have any suggestions, please [create an issue](https://github.com/Aree-Vanier/KSP-Profile-Manager/issues) so that I can improve the software.

# How it works
The software creates a symlink between a profile folder and the KSP install directory. This symlink causes windows to treat the remote folder as if it is in the KSP directory, allowing KSP (as well as CKAN) to run normally.
