import { ItemView, WorkspaceLeaf, TFile, Notice, SectionCache } from 'obsidian';

export const VIEW_TYPE_TASKS = 'task-manager';

export class TaskView extends ItemView {
    private container!: HTMLElement;
    private currentNote: TFile | null;
    private activeTab: 'all' | 'today' | 'todo' | 'overdue' | 'unplanned' | null = null;
    private projects: string[] = [];
    private tags: string[] = ['feature', 'bug', 'improvement']; // Default tags without #
    private priorities = [
        { value: 'high', label: 'High', color: 'red' },
        { value: 'medium', label: 'Medium', color: 'blue' },
        { value: 'low', label: 'Low', color: 'yellow' }
    ];
    private allVaultTags: Set<string> = new Set();
    private projectSelect!: HTMLSelectElement;
    private scratchpadEditor: HTMLTextAreaElement | null = null;
    private taskCounts = {
        today: 0,
        todo: 0,
        overdue: 0,
        unplanned: 0
    };
    private updateCountsDebouncer: NodeJS.Timeout | null = null;
    private isTaskListVisible: boolean = false;
    private delayedInitTimeout: number | undefined;

    navigation = false;
    options = {
        showRibbon: false
    };

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
        this.currentNote = this.app.workspace.getActiveFile();
        this.loadProjects();
        // Hide navigation buttons and menu
        this.containerEl.addClass('task-manager-view');
        this.contentEl.addClass('task-manager-content');
        
        // Add full width styles
        this.containerEl.style.width = '100%';
        this.containerEl.style.maxWidth = '100%';
        this.contentEl.style.width = '100%';
        this.contentEl.style.maxWidth = '100%';
        
        this.navigation = false;
        (this.leaf as any).tabHeaderEl?.querySelectorAll('.view-header-nav-buttons, .view-actions')
          ?.forEach((el: Element) => el.remove());
        // Defer vault scanning
        this.delayedInitTimeout = window.setTimeout(() => this.delayedInit(), 300);
    }

    private async loadProjects() {
        const files = this.app.vault.getMarkdownFiles();
        this.projects = [];

        for (const file of files) {
            const content = await this.app.vault.cachedRead(file);
            const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
            
            if (frontmatter && frontmatter.type === 'Project') {
                this.projects.push(file.basename);
            }
        }
    }

    private async loadAllTags() {
        this.allVaultTags.clear();
        const files = this.app.vault.getMarkdownFiles();
        
        for (const file of files) {
            const content = await this.app.vault.cachedRead(file);
            const matches = content.match(/🔖\s*(\w+)(?:\s|$)/g) || [];
            matches.forEach(match => {
                const tag = match.replace('🔖', '').trim();
                this.allVaultTags.add(tag);
            });
        }
    }

    getViewType(): string {
        return VIEW_TYPE_TASKS;
    }

    getDisplayText(): string {
        return 'Task Manager';
    }

    async onOpen() {
        const { containerEl } = this;
        
        // Initialize with 'all' as default tab
        this.activeTab = 'all';
        
        this.container = containerEl.createDiv({
            cls: 'quickEntryContainer',
            attr: { style: 'width: 100%; max-width: 100%;' }
        });
        
        const today = new Date();
        const dateString = today.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });

        this.container.innerHTML = `
            <div class="today-container">
                <div class="today" data-tab="today">
                    <div class="today-header">Today</div>
                    <div class="today-date">${dateString}</div>
                </div>
            </div>
            <div class="scratchpad-container">
                <h3>Scratchpad</h3>
                <textarea class="scratchpad-editor" placeholder="Quick notes and thoughts..."></textarea>
            </div>
            <div class="task-tabs">
                <div class="task-tab" data-tab="todo">
                    To Do
                    <span class="task-count" data-tab-count="todo">0</span>
                </div>
                <div class="task-tab" data-tab="overdue">
                    Overdue
                    <span class="task-count" data-tab-count="overdue">0</span>
                </div>
                <div class="task-tab" data-tab="unplanned">
                    Unplanned
                    <span class="task-count" data-tab-count="unplanned">0</span>
                </div>
            </div>
            <div class="task-input-form">
                <div class="metadata-section" style="overflow-x: auto; white-space: nowrap; scrollbar-width: none; -ms-overflow-style: none;">
                    <div class="metadata-row" style="display: inline-flex; gap: 10px; padding-bottom: 5px;">
                        <select class="project-select">
                            <option value="">Select Project</option>
                            ${this.projects.map(p => `<option value="${p}">${p}</option>`).join('')}
                        </select>
                        <select class="priority-select">
                            <option value="">Priority</option>
                            ${this.priorities.map(p => 
                                `<option value="${p.value}">${p.label}</option>`
                            ).join('')}
                        </select>
                        <div class="tag-input-container">
                            <input type="text" class="tag-input" placeholder="Add tags..." list="tag-suggestions">
                            <datalist id="tag-suggestions">
                                ${[...this.allVaultTags].map(t => `<option value="${t}">`).join('')}
                            </datalist>
                            <div class="selected-tags"></div>
                        </div>
                        <input type="date" class="due-date">
                    </div>
                </div>
                <div class="text-input-section">
                    <input type="text" class="task-input" placeholder="What needs to be done?">
                </div>
            </div>
            <div class="taskList"></div>
        `;

        // Add style to hide webkit scrollbar
        if (!document.querySelector('#task-manager-style')) {
            const style = document.createElement('style');
            style.id = 'task-manager-style';
            style.textContent = `
                .metadata-section::-webkit-scrollbar {
                    display: none;
                }
                .scratchpad-container {
                    margin: 10px 0;
                    padding: 10px;
                    background: var(--background-secondary);
                    border-radius: 5px;
                }
                .scratchpad-container h3 {
                    margin: 0 0 10px 0;
                    font-size: 16px;
                }
                .scratchpad-editor {
                    width: 100%;
                    min-height: 100px;
                    padding: 8px;
                    border-radius: 4px;
                    border: 1px solid var(--background-modifier-border);
                    background: var(--background-primary);
                    resize: vertical;
                    font-family: inherit;
                }
                .task-main-row {
                    display: flex;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 8px;
                }
                .task-tag {
                    display: inline-block;
                    padding: 2px 8px;
                    font-size: 12px;
                    border-radius: 12px;
                    background-color: var(--background-modifier-success);
                    color: var(--text-on-accent);
                    margin-left: 4px;
                }
                .task-metadata-row {
                    display: flex;
                    gap: 12px;
                    margin-top: 4px;
                    font-size: 12px;
                    color: var(--text-muted);
                }
                .task-priority {
                    padding: 2px 6px;
                    border-radius: 4px;
                }
                .priority-high {
                    background-color: var(--background-modifier-error);
                    color: var(--text-on-accent);
                }
                .priority-medium {
                    background-color: var(--background-modifier-border);
                }
                .priority-low {
                    background-color: var(--background-modifier-success-hover);
                }
                .task-edit-form .metadata-section::-webkit-scrollbar {
                    display: none;
                }
                .task-edit-form {
                    background: var(--background-primary);
                    padding: 10px;
                    border-radius: 5px;
                    margin-bottom: 10px;
                }
                .task-edit-form input,
                .task-edit-form select {
                    height: 30px;
                    padding: 0 8px;
                    border-radius: 4px;
                    border: 1px solid var(--background-modifier-border);
                }
                .task-edit-form .edit-actions button {
                    padding: 6px 12px;
                    border-radius: 4px;
                    border: 1px solid var(--background-modifier-border);
                    background: var(--interactive-normal);
                    color: var(--text-normal);
                    cursor: pointer;
                }
                .task-edit-form .edit-actions button:hover {
                    background: var(--interactive-hover);
                }
                .task-edit-form .tag-input-container {
                    position: relative;
                    min-width: 120px;
                }
            `;
            document.head.appendChild(style);
        }

        this.scratchpadEditor = this.container.querySelector('.scratchpad-editor');
        this.registerScratchpadEvents();
        await this.loadScratchpadContent();

        this.registerDomEvents();
        this.registerTaskInputEvents();
    }

    private async delayedInit() {
        // Defer loadAllTags
        await this.loadAllTags();
        // Defer updating counts
        this.updateTabCounts();
    }

    async onunload(): Promise<void> {
        // Any cleanup code here
        return Promise.resolve();
    }

    private async updateProjectSelect() {
        const projectSelect = this.container.querySelector('.project-select') as HTMLSelectElement;
        if (!projectSelect) return;

        projectSelect.innerHTML = `
            <option value="">Select Project</option>
            ${this.projects.map(p => `<option value="${p}">${p}</option>`).join('')}
        `;
    }

    private registerDomEvents() {
        const addButton = this.container.querySelector('.addTaskButton');
        addButton?.addEventListener('click', () => this.addTask());

        const todayTab = this.container.querySelector('.today');
        const regularTabs = Array.from(this.container.querySelectorAll('.task-tab'));
        const allTabs = [...regularTabs];
        if (todayTab) allTabs.push(todayTab);

        allTabs.forEach(tab => {
            tab.addEventListener('click', async (e) => {
                const clickedTab = e.currentTarget as HTMLElement;
                const tabType = clickedTab.dataset.tab as 'all' | 'today' | 'todo' | 'overdue' | 'unplanned';
                if (!tabType) return;

                // Toggle task list visibility if clicking the same tab
                if (this.activeTab === tabType) {
                    this.isTaskListVisible = !this.isTaskListVisible;
                    const taskListContainer = this.container.querySelector('.taskList');
                    if (taskListContainer) {
                        if (this.isTaskListVisible) {
                            await this.refreshTaskList();
                        } else {
                            taskListContainer.empty();
                        }
                    }
                    return;
                }

                // Remove active class from all tabs and add to clicked tab
                allTabs.forEach(t => t.classList.remove('active'));
                clickedTab.classList.add('active');
                this.activeTab = tabType;
                this.isTaskListVisible = true;

                // Refresh tasks immediately without setTimeout
                await this.refreshTaskList();
            });
        });

        // Add project refresh when focusing the select
        const projectSelect = this.container.querySelector('.project-select');
        projectSelect?.addEventListener('focus', async () => {
            await this.loadProjects();
            await this.updateProjectSelect();
        });
    }

    private registerTaskInputEvents() {
        const taskInput = this.container.querySelector('.task-input') as HTMLInputElement;  // Changed from .newTaskInput
        const projectSelect = this.container.querySelector('.project-select') as HTMLSelectElement;
        const prioritySelect = this.container.querySelector('.priority-select') as HTMLSelectElement;
        const dueDateInput = this.container.querySelector('.due-date') as HTMLInputElement;
        const selectedTagsContainer = this.container.querySelector('.selected-tags') as HTMLDivElement;

        taskInput?.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                const selectedTags = Array.from(selectedTagsContainer.children).map(
                    tagEl => tagEl.textContent?.replace('🔖', '').replace('×', '').trim() || ''
                ).filter(tag => tag);

                await this.createTask(
                    taskInput.value,
                    projectSelect.value,
                    prioritySelect.value,
                    selectedTags,
                    dueDateInput.value
                );
                this.updateTodayCount();
            }
        });

        // Add tag select handling
        const tagSelect = this.container.querySelector('.tag-select') as HTMLSelectElement;
        tagSelect?.addEventListener('change', (e) => {
            const select = e.target as HTMLSelectElement;
            if (select.value === "") {
                const newTag = prompt("Enter new tag name:");
                if (newTag) {
                    this.addNewTag(newTag);
                }
                select.value = newTag || "";
            }
        });

        const tagInput = this.container.querySelector('.tag-input') as HTMLInputElement;
        const selectedTags: Set<string> = new Set();

        tagInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && tagInput.value) {
                e.preventDefault();
                const tag = tagInput.value.trim();
                if (tag && !selectedTags.has(tag)) {
                    selectedTags.add(tag);
                    if (!this.allVaultTags.has(tag)) {
                        this.allVaultTags.add(tag);
                        const datalist = this.container.querySelector('#tag-suggestions');
                        if (datalist) {
                            const option = document.createElement('option');
                            option.value = tag;
                            datalist.appendChild(option);
                        }
                    }
                    const tagEl = createEl('span', {
                        cls: 'selected-tag',
                        text: `🔖 ${tag}`
                    });
                    const removeBtn = createEl('span', {
                        cls: 'remove-tag',
                        text: '×'
                    });
                    removeBtn.addEventListener('click', () => {
                        selectedTags.delete(tag);
                        tagEl.remove();
                    });
                    tagEl.appendChild(removeBtn);
                    selectedTagsContainer.appendChild(tagEl);
                }
                tagInput.value = '';
            }
        });
    }

    private addNewTag(tag: string) {
        const cleanTag = tag.trim().toLowerCase().replace(/\s+/g, '-');
        if (!this.tags.includes(cleanTag)) {
            this.tags.push(cleanTag);
            const tagSelect = this.container.querySelector('.tag-select') as HTMLSelectElement;
            const option = document.createElement('option');
            option.value = cleanTag;
            option.text = `🏷️ ${cleanTag}`;
            tagSelect.add(option);
        }
    }

    private async createTask(
        text: string, 
        projectName: string,
        priority: string,
        tags: string[], 
        dueDate: string
    ) {
        if (!text.trim()) {
            new Notice('Task text cannot be empty');
            return;
        }

        try {
            const projectFile = this.app.vault.getMarkdownFiles().find(
                file => file.basename === projectName
            );

            if (!projectFile) {
                new Notice('Please select a project');
                return;
            }

            const priorityLabel = this.priorities.find(p => p.value === priority)?.label || '';
            const metadata = [
                dueDate ? `📅 ${dueDate}` : '',
                priorityLabel ? `(${priorityLabel})` : '',
                ...tags.map(tag => `🔖 ${tag}`)  // Add 🔖 icon to each tag
            ].filter(Boolean).join(' ');

            const taskLine = `- [ ] ${text.trim()} ${metadata}`;
            const content = await this.app.vault.read(projectFile);

            // Find or create Tasks section
            const contentLines = content.split('\n');
            const taskSectionIndex = contentLines.findIndex(line => line.trim() === '## Tasks');
            
            if (taskSectionIndex === -1) {
                // If Tasks section doesn't exist, create it at the end
                contentLines.push('', '## Tasks', taskLine);
            } else {
                // Insert task after the Tasks heading
                contentLines.splice(taskSectionIndex + 1, 0, taskLine);
            }

            await this.app.vault.modify(projectFile, contentLines.join('\n'));
            new Notice('Task added to project!');
            this.clearInputs();
            await this.refreshTaskList();
            this.updateTodayCount();
        } catch (error) {
            console.error('Error creating task:', error);
            new Notice('Failed to create task');
        }
    }

    private clearInputs() {
        const inputs = this.container.querySelectorAll('input, select') as NodeListOf<HTMLInputElement | HTMLSelectElement>;
        const selectedTagsContainer = this.container.querySelector('.selected-tags');
        
        inputs.forEach(input => {
            if (input.type === 'select-multiple') {
                (input as HTMLSelectElement).selectedIndex = -1;
            } else {
                input.value = '';
            }
        });

        if (selectedTagsContainer) {
            selectedTagsContainer.innerHTML = '';
        }
    }

    private async addTask() {
        if (!this.currentNote) {
            new Notice('No active file selected');
            return;
        }

        const input = this.container.querySelector('.newTaskInput') as HTMLInputElement | null;
        if (!input) return;

        const taskText = input.value.trim();
        
        if (!taskText) {
            new Notice('Task cannot be empty!');
            return;
        }

        const content = await this.app.vault.read(this.currentNote);
        const today = new Date().toISOString().split('T')[0];
        const updatedContent = content + `\n- [ ] ${taskText} 📅 ${today}`;
        
        await this.app.vault.modify(this.currentNote, updatedContent);
        new Notice('Task added successfully!');
        input.value = '';
        await this.refreshTaskList();
        this.updateTodayCount();
    }

    private createTaskElement({ text: task, file }: { text: string, file: TFile }) {
        const taskEl = createDiv('task-item');
        const isChecked = task.includes('[x]');
        const taskText = task.replace(/^- \[(x| )\] /, '');
        
        // Split metadata into tags and other metadata
        const tagMatches = task.match(/🔖\s*(\w+)/g) || [];
        const dueDateMatch = task.match(/📅 (\d{4}-\d{2}-\d{2})/);
        const dueDate = dueDateMatch ? dueDateMatch[1] : '';
        const priorityMatch = task.match(/\((High|Medium|Low)\)/);
        const priority = priorityMatch ? priorityMatch[1] : '';

        taskEl.innerHTML = `
            <div class="task-content">
                <div class="task-main-row">
                    <input type="checkbox" ${isChecked ? 'checked' : ''}>
                    <span class="task-text">${this.formatTaskText(taskText)}</span>
                    ${tagMatches.map(tag => {
                        const cleanTag = tag.replace('🔖', '').trim();
                        return `<span class="task-tag">${cleanTag}</span>`;
                    }).join('')}
                </div>
                <div class="task-metadata-row">
                    <span class="task-project" style="cursor: pointer;">${file.basename}</span>
                    ${priority ? `<span class="task-priority priority-${priority.toLowerCase()}">${priority}</span>` : ''}
                    ${dueDate ? `<span class="task-date">${dueDate}</span>` : ''}
                </div>
            </div>
            <div class="task-actions">
                <button class="task-edit-btn">Edit</button>
                <button class="task-delete-btn">Delete</button>
            </div>
        `;

        const checkbox = taskEl.querySelector('input');
        checkbox?.addEventListener('change', () => this.toggleTask(task, isChecked, file));

        const editBtn = taskEl.querySelector('.task-edit-btn');
        editBtn?.addEventListener('click', () => this.editTask(taskEl, task, file));

        const deleteBtn = taskEl.querySelector('.task-delete-btn');
        if (deleteBtn) {  // Add null check
            // Create a new function reference for each delete button
            const deleteHandler = async () => {
                const confirmed = window.confirm('Are you sure you want to delete this task?');
                if (!confirmed) return;

                try {
                    const content = await this.app.vault.read(file);
                    const lines = content.split('\n');
                    const taskIndex = lines.findIndex(line => line.includes(task));

                    if (taskIndex !== -1) {
                        lines.splice(taskIndex, 1);
                        await this.app.vault.modify(file, lines.join('\n'));
                        
                        // Remove the task element directly from DOM
                        taskEl.remove();
                        
                        // Update counts without full refresh
                        await this.updateTabCounts();
                        new Notice('Task deleted successfully');
                    }
                } catch (error) {
                    console.error('Error deleting task:', error);
                    new Notice('Failed to delete task');
                }
            };

            deleteBtn.addEventListener('click', deleteHandler);
        }

        // Add project click handler
        const projectSpan = taskEl.querySelector('.task-project');
        projectSpan?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openProject(file);
        });
        
        return taskEl;
    }

    // Remove or update the formatTaskMetadata method since we're not using it anymore
    private formatTaskMetadata(task: string): string {
        return ''; // This method is no longer needed but kept for compatibility
    }

    private async openProject(file: TFile) {
        // Open the project file in a new leaf
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file);
    }

    private async editTask(taskEl: HTMLElement, originalTask: string, file: TFile) {
        // Create edit form
        const editForm = createDiv({ cls: 'task-edit-form task-input-form' });
        const originalText = this.formatTaskText(originalTask.replace(/^- \[(x| )\] /, ''));
        const isChecked = originalTask.includes('[x]');
        
        editForm.innerHTML = `
            <div class="metadata-section" style="overflow-x: auto; white-space: nowrap; scrollbar-width: none; -ms-overflow-style: none;">
                <div class="metadata-row" style="display: inline-flex; gap: 10px; padding-bottom: 5px;">
                    <select class="edit-project-select project-select">
                        <option value="">Select Project</option>
                        ${this.projects.map(p => 
                            `<option value="${p}" ${file.basename === p ? 'selected' : ''}>
                                ${p}
                            </option>`
                        ).join('')}
                    </select>
                    <select class="edit-priority-select priority-select">
                        <option value="">Priority</option>
                        ${this.priorities.map(p => 
                            `<option value="${p.value}" ${originalTask.includes(p.label) ? 'selected' : ''}>
                                ${p.label}
                            </option>`
                        ).join('')}
                    </select>
                    <div class="tag-input-container">
                        <input type="text" class="edit-tag-input tag-input" placeholder="Add tags..." list="edit-tag-suggestions">
                        <datalist id="edit-tag-suggestions">
                            ${[...this.allVaultTags].map(t => `<option value="${t}">`).join('')}
                        </datalist>
                        <div class="edit-selected-tags selected-tags">
                            ${this.getExistingTags(originalTask).map(tag => 
                                `<span class="selected-tag">🔖 ${tag}<span class="remove-tag">×</span></span>`
                            ).join('')}
                        </div>
                    </div>
                    <input type="date" class="edit-due-date due-date" value="${this.getExistingDate(originalTask)}">
                </div>
            </div>
            <div class="text-input-section">
                <input type="text" class="edit-task-input task-input" value="${originalText}" placeholder="What needs to be done?">
            </div>
            <div class="edit-actions" style="display: flex; gap: 10px; margin-top: 10px;">
                <button class="save-edit" style="flex: 1;">Save</button>
                <button class="cancel-edit" style="flex: 1;">Cancel</button>
            </div>
        `;

        // Replace task content with edit form
        const originalContent = taskEl.innerHTML;
        taskEl.innerHTML = '';
        taskEl.appendChild(editForm);

        // Setup edit form handlers
        this.setupEditFormHandlers(editForm, taskEl, originalContent, originalTask, file, isChecked);
    }

    private setupEditFormHandlers(
        editForm: HTMLElement, 
        taskEl: HTMLElement, 
        originalContent: string,
        originalTask: string,
        file: TFile,
        isChecked: boolean
    ) {
        const saveBtn = editForm.querySelector('.save-edit');
        const cancelBtn = editForm.querySelector('.cancel-edit');
        const tagInput = editForm.querySelector('.edit-tag-input') as HTMLInputElement;
        const selectedTagsContainer = editForm.querySelector('.edit-selected-tags') as HTMLElement;

        // Tag input handler
        tagInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && tagInput.value) {
                e.preventDefault();
                const tag = tagInput.value.trim();
                this.addTagToEdit(tag, selectedTagsContainer);
                tagInput.value = '';
            }
        });

        // Setup existing tag removal
        selectedTagsContainer?.querySelectorAll('.remove-tag').forEach(btn => {
            btn.addEventListener('click', () => {
                (btn.parentElement as HTMLElement).remove();
            });
        });

        // Save handler
        saveBtn?.addEventListener('click', async () => {
            const newText = (editForm.querySelector('.edit-task-input') as HTMLInputElement).value;
            const priority = (editForm.querySelector('.edit-priority-select') as HTMLSelectElement).value;
            const dueDate = (editForm.querySelector('.edit-due-date') as HTMLInputElement).value;
            const tags = Array.from(selectedTagsContainer.children).map(
                tagEl => tagEl.textContent?.replace('🔖', '').replace('×', '').trim() || ''
            ).filter(tag => tag);

            await this.updateTask(originalTask, newText, priority, tags, dueDate, file, isChecked);
        });

        // Cancel handler
        cancelBtn?.addEventListener('click', () => {
            taskEl.innerHTML = originalContent;
        });
    }

    private addTagToEdit(tag: string, container: HTMLElement) {
        if (!tag || Array.from(container.children).some(child => 
            child.textContent?.replace('🔖', '').replace('×', '').trim() === tag
        )) return;
        
        const tagEl = this.createEl('span', {
            cls: 'selected-tag',
            text: `🔖 ${tag}`
        });
        
        const removeBtn = this.createEl('span', {
            cls: 'remove-tag',
            text: '×'
        });
        
        removeBtn.addEventListener('click', () => tagEl.remove());
        tagEl.appendChild(removeBtn);
        container.appendChild(tagEl);
    }

    private async updateTask(
        originalTask: string,
        newText: string,
        priority: string,
        tags: string[],
        dueDate: string,
        file: TFile,
        isChecked: boolean
    ) {
        try {
            const editForm = document.querySelector('.task-edit-form');
            const newProjectName = (editForm?.querySelector('.edit-project-select') as HTMLSelectElement)?.value;
            const newProjectFile = this.app.vault.getMarkdownFiles().find(f => f.basename === newProjectName);
            
            if (!newProjectFile) {
                new Notice('Invalid project selected');
                return;
            }

            // If project changed, remove from old file and add to new file
            if (newProjectFile.path !== file.path) {
                // Remove from old file
                let oldContent = await this.app.vault.read(file);
                const oldLines = oldContent.split('\n');
                const oldTaskIndex = oldLines.findIndex(line => line.includes(originalTask));
                if (oldTaskIndex !== -1) {
                    oldLines.splice(oldTaskIndex, 1);
                    await this.app.vault.modify(file, oldLines.join('\n'));
                }

                // Add to new file
                let newContent = await this.app.vault.read(newProjectFile);
                const newLines = newContent.split('\n');
                const taskSectionIndex = newLines.findIndex(line => line.trim() === '## Tasks');
                
                const priorityLabel = this.priorities.find(p => p.value === priority)?.label || '';
                const metadata = [
                    dueDate ? `📅 ${dueDate}` : '',
                    priorityLabel ? `(${priorityLabel})` : '',
                    ...tags.map(tag => `🔖 ${tag}`)
                ].filter(Boolean).join(' ');

                const newTaskLine = `- [${isChecked ? 'x' : ' '}] ${newText.trim()} ${metadata}`;
                
                if (taskSectionIndex === -1) {
                    newLines.push('', '## Tasks', newTaskLine);
                } else {
                    newLines.splice(taskSectionIndex + 1, 0, newTaskLine);
                }
                
                await this.app.vault.modify(newProjectFile, newLines.join('\n'));
            } else {
                // Update in same file
                const content = await this.app.vault.read(file);
                const lines = content.split('\n');
                const taskIndex = lines.findIndex(line => line.includes(originalTask));

                if (taskIndex !== -1) {
                    const priorityLabel = this.priorities.find(p => p.value === priority)?.label || '';
                    const metadata = [
                        dueDate ? `📅 ${dueDate}` : '',
                        priorityLabel ? `(${priorityLabel})` : '',
                        ...tags.map(tag => `🔖 ${tag}`)
                    ].filter(Boolean).join(' ');

                    lines[taskIndex] = `- [${isChecked ? 'x' : ' '}] ${newText.trim()} ${metadata}`;
                    await this.app.vault.modify(file, lines.join('\n'));
                }
            }

            // Clear the task element cache
            this.clearTaskElementCache();
            
            // Clear the task list container
            const taskListContainer = this.container.querySelector('.taskList');
            if (taskListContainer) {
                taskListContainer.empty();
            }

            // Refresh the task list
            await this.refreshTaskList();
            new Notice('Task updated successfully');
            
            // Update counts after refresh
            await this.updateTabCounts();
            this.updateTodayCount();

        } catch (error) {
            console.error('Error updating task:', error);
            new Notice('Failed to update task');
        }
    }

    private getExistingTags(task: string): string[] {
        const matches = task.match(/🔖\s*(\w+)/g) || [];
        // Use Set to remove duplicates and then convert back to array
        return [...new Set(matches.map(match => match.replace('🔖', '').trim()))];
    }

    private getExistingDate(task: string): string {
        const match = task.match(/📅 (\d{4}-\d{2}-\d{2})/);
        return match ? match[1] : '';
    }

    private async refreshTaskList() {
        const taskListContainer = this.container.querySelector('.taskList');
        if (!taskListContainer || !this.activeTab) return;
    
        try {
            // Clear the task element cache when refreshing
            this.clearTaskElementCache();
            taskListContainer.empty();
            const currentTab = this.activeTab;
            const today = new Date().toISOString().split('T')[0];
    
            // Get all project files with metadata cache
            const projectFiles = this.app.vault.getMarkdownFiles().filter(file => {
                const cache = this.app.metadataCache.getFileCache(file);
                return cache?.frontmatter?.type === 'Project';
            });
    
            // Pre-filter files based on the current tab to reduce processing
            const relevantFiles = currentTab === 'today' ? 
                await Promise.all(
                    projectFiles.map(async file => {
                        const content = await this.app.vault.cachedRead(file);
                        return content.includes(`📅 ${today}`) ? file : null;
                    })
                ).then(files => files.filter((f): f is TFile => f !== null))
                : projectFiles;
    
            // Use a virtual list for rendering
            const fragment = document.createDocumentFragment();
            let virtualList: {text: string, file: TFile}[] = [];
            
            // Process files in parallel with optimized batch size
            const batchSize = 10;
            const batches = [];
            
            for (let i = 0; i < relevantFiles.length; i += batchSize) {
                const batch = relevantFiles.slice(i, i + batchSize);
                batches.push(batch);
            }

            for (const batch of batches) {
                const batchTasks = await Promise.all(batch.map(async file => {
                    const content = await this.app.vault.cachedRead(file);
                    const cache = this.app.metadataCache.getFileCache(file);
                    const taskSection = cache?.sections?.find(s => 
                        s.type === 'heading' && 
                        content.slice(s.position.start.offset, s.position.end.offset).includes('Tasks')
                    );
                    
                    if (!taskSection) return [];
                    
                    const taskLines = content
                        .split('\n')
                        .slice(taskSection.position.start.line + 1)
                        .filter(line => line.match(/^- \[(x| )\]/));
                    
                    return taskLines.map(task => ({ text: task, file }));
                }));
                
                virtualList = virtualList.concat(batchTasks.flat());
            }

            // Filter tasks based on current tab - using optimized filtering
            const filteredTasks = this.getFilteredTasks(virtualList, currentTab, today);
            
            // Render tasks in chunks using requestAnimationFrame
            const chunkSize = 20;
            let index = 0;

            const renderChunk = () => {
                const chunk = filteredTasks.slice(index, index + chunkSize);
                const chunkFragment = document.createDocumentFragment();
                
                chunk.forEach(task => {
                    chunkFragment.appendChild(this.renderTaskElement(task));
                });
                
                taskListContainer.appendChild(chunkFragment);
                index += chunkSize;
                
                if (index < filteredTasks.length) {
                    requestAnimationFrame(renderChunk);
                }
            };

            if (filteredTasks.length > 0) {
                requestAnimationFrame(renderChunk);
            }

            // Update counts in background
            setTimeout(() => this.updateTabCounts(), 0);
            
        } catch (error) {
            console.error("Error refreshing task list:", error);
            taskListContainer.empty();
        }
    }

    private getFilteredTasks(
        tasks: {text: string, file: TFile}[], 
        tab: string, 
        today: string
    ): {text: string, file: TFile}[] {
        // Optimize filtering with a single pass
        return tasks.filter(({text}) => {
            const isCompleted = text.includes('[x]');
            const dateMatch = text.match(/📅 (\d{4}-\d{2}-\d{2})/);
            
            switch(tab) {
                case 'today':
                    return dateMatch && dateMatch[1] === today;
                case 'todo':
                    return !isCompleted && dateMatch;
                case 'overdue':
                    return !isCompleted && dateMatch && dateMatch[1] < today;
                case 'unplanned':
                    return !isCompleted && !dateMatch;
                default:
                    return false;
            }
        });
    }

    private renderTaskElement({ text: task, file }: { text: string, file: TFile }): HTMLElement {
        // Cache DOM element creation
        const taskEl = this.taskElementCache.get(task) ?? this.createTaskElement({ text: task, file });
        this.taskElementCache.set(task, taskEl.cloneNode(true) as HTMLElement);
        return taskEl;
    }

    // Add this property to the class
    private taskElementCache: Map<string, HTMLElement> = new Map();

    // Add this method to clear cache when needed
    private clearTaskElementCache() {
        this.taskElementCache.clear();
    }

    // Add new method to clear task list
    private clearTaskList() {
        const taskListContainer = this.container.querySelector('.taskList');
        if (taskListContainer) {
            taskListContainer.empty();
        }
    }

    // Add new method to update tab counts without showing tasks
    private async updateTabCounts() {
        if (this.updateCountsDebouncer) {
            clearTimeout(this.updateCountsDebouncer);
        }

        this.updateCountsDebouncer = setTimeout(async () => {
            const today = new Date().toISOString().split('T')[0];
            try {
                const projectFiles = this.app.vault.getMarkdownFiles()
                    .filter(file => {
                        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
                        return frontmatter?.type === 'Project';
                    });

                // Reset counts
                this.taskCounts = {
                    today: 0,
                    todo: 0,
                    overdue: 0,
                    unplanned: 0
                };

                // Process files in parallel with a limit
                const batchSize = 5;
                for (let i = 0; i < projectFiles.length; i += batchSize) {
                    const batch = projectFiles.slice(i, i + batchSize);
                    await Promise.all(batch.map(async file => {
                        const content = await this.app.vault.cachedRead(file);
                        const lines = content.split('\n');
                        const taskSectionIndex = lines.findIndex(line => line.trim() === '## Tasks');
                        
                        if (taskSectionIndex === -1) return;

                        lines.slice(taskSectionIndex + 1)
                            .filter(line => line.match(/^- \[(x| )\]/))
                            .forEach(task => {
                                const dateMatch = task.match(/📅 (\d{4}-\d{2}-\d{2})/);
                                const isCompleted = task.includes('[x]');

                                if (!isCompleted) {
                                    if (dateMatch) {
                                        if (dateMatch[1] === today) {
                                            this.taskCounts.today++;
                                        }
                                        if (dateMatch[1] < today) {
                                            this.taskCounts.overdue++;
                                        }
                                        this.taskCounts.todo++;
                                    } else {
                                        this.taskCounts.unplanned++;
                                    }
                                } else if (dateMatch && dateMatch[1] === today) {
                                    this.taskCounts.today++;
                                }
                            });
                    }));
                }

                // Update UI
                Object.entries(this.taskCounts).forEach(([tab, count]) => {
                    const countEl = this.container.querySelector(`[data-tab-count="${tab}"]`);
                    if (countEl) countEl.textContent = count.toString();
                });

            } catch (error) {
                console.error("Error updating tab counts:", error);
            }
        }, 100); // Small delay to batch multiple updates
    }

    private updateTodayCount() {
        // Use the cached count instead of recalculating
        const todayCountEl = this.container.querySelector('[data-tab-count="today"]');
        if (todayCountEl) {
            todayCountEl.textContent = this.taskCounts.today.toString();
        }
    }

    private formatTaskText(text: string): string {
        // Remove all metadata (date, priority, tags) from task text
        return text
            .replace(/📅 \d{4}-\d{2}-\d{2}/, '')
            .replace(/\((High|Medium|Low)\)/, '')
            .replace(/🔖 \w+/g, '')
            .trim();
    }

    private async toggleTask(taskLine: string, currentState: boolean, projectFile: TFile) {
        try {
            const content = await this.app.vault.read(projectFile);
            const lines = content.split('\n');
            const taskIndex = lines.findIndex(line => line.includes(taskLine));

            if (taskIndex !== -1) {
                lines[taskIndex] = lines[taskIndex].replace(
                    currentState ? '[x]' : '[ ]',
                    currentState ? '[ ]' : '[x]'
                );
                await this.app.vault.modify(projectFile, lines.join('\n'));
                await this.updateTabCounts(); // Changed to use the optimized version
            }
        } catch (error) {
            console.error('Error toggling task:', error);
            new Notice('Failed to toggle task');
        }
    }

    private createEl(tag: string, options: { cls?: string, text?: string } = {}): HTMLElement {
        const el = document.createElement(tag);
        if (options.cls) el.className = options.cls;
        if (options.text) el.textContent = options.text;
        return el;
    }

    private handleTaskChange() {
        this.updateTodayCount();
    }

    public handleCreateTask() {
        const taskInput = this.container.querySelector('.task-input') as HTMLInputElement;
        const projectSelect = this.container.querySelector('.project-select') as HTMLSelectElement;
        const prioritySelect = this.container.querySelector('.priority-select') as HTMLSelectElement;
        const dueDateInput = this.container.querySelector('.due-date') as HTMLInputElement;
        const selectedTagsContainer = this.container.querySelector('.selected-tags') as HTMLDivElement;

        if (!taskInput || !projectSelect || !prioritySelect || !dueDateInput || !selectedTagsContainer) {
            new Notice('Required elements not found');
            return;
        }

        const selectedTags = Array.from(selectedTagsContainer.children).map(
            tagEl => tagEl.textContent?.replace('🔖', '').replace('×', '').trim() || ''
        ).filter(tag => tag);

        this.createTask(
            taskInput.value,
            projectSelect.value,
            prioritySelect.value,
            selectedTags,
            dueDateInput.value
        );
        this.updateTodayCount();
    }

    async refresh() {
        // Clear existing tasks
        this.containerEl.querySelector('.task-list')?.empty();
        
        // Re-load tasks
        await this.loadTasks();
        
        // Re-render view
        await this.render();
    }

    private async render() {
        // Clear existing content
        this.containerEl.empty();
        
        // Re-create the container
        this.container = this.containerEl.createDiv({
            cls: 'quickEntryContainer',
            attr: { style: 'width: 100%; max-width: 100%;' }
        });
        
        // Re-initialize the view
        await this.onOpen();
    }

    private async loadTasks() {
        // Your existing task loading logic
        // ...existing code...
    }

    private registerScratchpadEvents() {
        if (!this.scratchpadEditor) return;

        // Reduce debounce time and make sure the save happens
        let saveTimeout: NodeJS.Timeout;
        this.scratchpadEditor.addEventListener('input', () => {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(async () => {
                await this.saveScratchpadContent();
            }, 300); // Reduced to 300ms for more responsive feel
        });

        // Also save on blur (when user clicks away)
        this.scratchpadEditor.addEventListener('blur', async () => {
            await this.saveScratchpadContent();
        });

        const projectSelect = this.container.querySelector('.project-select');
        projectSelect?.addEventListener('change', async () => {
            await this.loadScratchpadContent();
        });
    }

    private async loadScratchpadContent() {
        if (!this.scratchpadEditor) return;

        const projectSelect = this.container.querySelector('.project-select') as HTMLSelectElement;
        if (!projectSelect?.value) {
            this.scratchpadEditor.value = '';
            return;
        }

        const projectFile = this.app.vault.getMarkdownFiles().find(
            file => file.basename === projectSelect.value
        );

        if (!projectFile) return;

        const content = await this.app.vault.read(projectFile);
        const frontmatter = this.app.metadataCache.getFileCache(projectFile)?.frontmatter;
        
        this.scratchpadEditor.value = frontmatter?.scratchpad || '';
    }

    private async saveScratchpadContent() {
        if (!this.scratchpadEditor) return;

        const projectSelect = this.container.querySelector('.project-select') as HTMLSelectElement;
        if (!projectSelect?.value) return;

        const projectFile = this.app.vault.getMarkdownFiles().find(
            file => file.basename === projectSelect.value
        );

        if (!projectFile) return;

        try {
            const content = await this.app.vault.read(projectFile);
            const scratchpadContent = this.scratchpadEditor.value;

            // Improved frontmatter handling
            const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
            const hasFrontmatter = frontmatterRegex.test(content);
            
            let newContent: string;
            if (!hasFrontmatter) {
                // Create new frontmatter
                newContent = `---\ntype: Project\nscratchpad: "${scratchpadContent.replace(/"/g, '\\"')}"\n---\n\n${content}`;
            } else {
                newContent = content.replace(frontmatterRegex, (match: string, frontmatter: string) => {
                    const frontmatterLines = frontmatter.split('\n');
                    const scratchpadLineIndex = frontmatterLines.findIndex((line: string) => line.startsWith('scratchpad:'));
                    
                    if (scratchpadLineIndex >= 0) {
                        frontmatterLines[scratchpadLineIndex] = `scratchpad: "${scratchpadContent.replace(/"/g, '\\"')}"`;
                    } else {
                        frontmatterLines.push(`scratchpad: "${scratchpadContent.replace(/"/g, '\\"')}"`);
                    }
                    
                    return `---\n${frontmatterLines.join('\n')}\n---`;
                });
            }

            await this.app.vault.modify(projectFile, newContent);
        } catch (error) {
            console.error('Error saving scratchpad:', error);
            new Notice('Failed to save scratchpad');
        }
    }
}
