# KSP Profile Manager
A software utility to simplify the managing of Kerbal Space Program mod profiles.

Each profile has it's own:
  - Saves folder
  - GameData folder
  - CKAN folder
  - Ships folder
  
This allows you to have one set of mods for your career, and a seperate set of mods for your sandbox.

For usage instructions, please refer to the [wiki](https://github.com/Aree-Vanier/KSP-Profile-Manager/wiki)

# Mod conflicts
There should be no mod conflicts, as no mods run outside of the KSP environment. The profile manager is compatible with CKAN.

There is currently no proper support for KSP updates, however adding support is a high priority.

There is currently only support for windows computers, because I have no means of testing on a mac, and have not yet tested on linux.

# Reporting bugs
This is still in a developmental phase. If you encouter any error, or have any suggestions, please [create an issue](https://github.com/Aree-Vanier/KSP-Profile-Manager/issues) so that I can improve the software.

# How it works
The software creates a symlink between a profile folder and the KSP install directory. This symlink causes windows to treat the remote folder as if it is in the KSP directory, allowing KSP (as well as CKAN) to run normally.
