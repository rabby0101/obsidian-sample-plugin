# Task Manager for Obsidian

A comprehensive task management plugin for Obsidian that helps you organize tasks with projects, priorities, and tags.

## Features

- Project-based task organization
- Priority levels (High, Medium, Low)
- Tag support with emoji indicators
- Due date tracking
- Task filtering (Today, Todo, Overdue, Unplanned)
- Quick task entry
- Task editing and deletion
- Task completion tracking

## Installation


1. Open Settings > Community plugins
2. Turn off Safe mode if enabled
3. Click Browse community plugins
4. Search for "BRAT"
5. Click Install
6. Once installed, close the community plugins window and activate the newly installed plugin
7. From BRAT settings, click Add Beta plugin
8. Enter this address: https://github.com/rabby0101/task-manager
9. Once installed, close the community plugins window and activate the newly installed plugin

### Manual Installation

1. Download the latest release
2. Extract the zip archive in `.obsidian/plugins/` directory
3. Reload Obsidian
4. Enable plugin in community plugins settings

## Basic Idea
1. Every task will be part of a project. The projects can be shopping list, daily routine, and real projects etc... you get the point...
2. Projects are simply any notes which has a metadata " type : Project ".
3. You can add this manager to any notes any time simply by calling ```task-manager```
4. When you want to add a new task, you have to select a project first, otherwise it won't add the task. you can later change the project from Project A -> Project B
5. All it'll do is, it will create a new section ## Tasks on that selected project and append the task. if the ## Tasks section already in that project, it'll just append the task there. 

## Known Issues
1. Scratchpad is not doing anything at the moment but i'll work on that soon. 
