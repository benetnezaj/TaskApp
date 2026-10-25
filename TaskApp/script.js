'use strict';

const loginScreen = document.querySelector('#login-screen');
const taskScreen = document.querySelector('#task-screen');
const loginForm = document.querySelector('#login-form');
const taskForm = document.querySelector('#task-form');
const taskInput = document.querySelector('#task-input');
const taskList = document.querySelector('#task-list');
const storageError = document.querySelector('#storage-error');
let username = '';
let tasks = [];

const sharedStorageKey = 'task-app:shared-tasks:v1';

function isTask(task) {
  return task && typeof task.id === 'string' && typeof task.text === 'string' &&
    typeof task.done === 'boolean' && typeof task.author === 'string';
}

function ownsTask(task) {
  return task.author.toLowerCase() === username.toLowerCase();
}

function loadTasks() {
  const saved = JSON.parse(localStorage.getItem(sharedStorageKey) || '[]');
  if (!Array.isArray(saved)) throw new Error('Invalid task data');
  tasks = saved.filter(isTask);
}

function migrateTasks() {
  // Preserve tasks from the original per-username storage, including their authors.
  const legacyKeys = Object.keys(localStorage).filter(key => key.startsWith('task-app:tasks:'));
  for (const key of legacyKeys) {
    const author = decodeURIComponent(key.slice('task-app:tasks:'.length));
    const saved = JSON.parse(localStorage.getItem(key) || '[]');
    if (!Array.isArray(saved)) throw new Error('Invalid task data');
    for (const task of saved) {
      const migrated = { ...task, author };
      if (isTask(migrated) && !tasks.some(existing => existing.id === task.id)) tasks.push(migrated);
    }
  }
  // Only retire old copies after the shared list has been saved successfully.
  localStorage.setItem(sharedStorageKey, JSON.stringify(tasks));
  for (const key of legacyKeys) localStorage.removeItem(key);
}

function saveTasks() {
  try {
    localStorage.setItem(sharedStorageKey, JSON.stringify(tasks));
    storageError.textContent = '';
  } catch {
    storageError.textContent = 'Your browser could not save these changes. Keep this tab open to retain your tasks.';
  }
}

function renderTasks() {
  taskList.replaceChildren();
  for (const task of tasks) {
    const row = document.createElement('li');
    row.className = `task-row${task.done ? ' completed' : ''}`;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'task-checkbox';
    checkbox.id = `task-${task.id}`;
    checkbox.checked = task.done;
    checkbox.disabled = !ownsTask(task);
    checkbox.title = ownsTask(task) ? 'Mark your task complete' : `Only ${task.author} can change this task`;
    const label = document.createElement('label');
    label.className = 'task-text';
    label.htmlFor = checkbox.id;
    label.textContent = task.text;
    checkbox.addEventListener('change', () => {
      if (!ownsTask(task)) return;
      task.done = checkbox.checked;
      row.classList.toggle('completed', task.done);
      saveTasks();
      updateCounts();
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'delete-button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Remove task: ${task.text}`);
    remove.addEventListener('click', () => {
      if (!ownsTask(task)) return;
      const index = tasks.indexOf(task);
      tasks.splice(index, 1);
      saveTasks();
      renderTasks();
      const next = taskList.children[Math.min(index, tasks.length - 1)];
      (next?.querySelector('.delete-button') || taskInput).focus();
      document.querySelector('#task-announcement').textContent = 'Task removed.';
    });
    const details = document.createElement('div');
    details.className = 'task-details';
    const author = document.createElement('span');
    author.className = 'task-author';
    author.textContent = `${task.author}${ownsTask(task) ? ' (you)' : ''}`;
    details.append(label, author);
    row.append(checkbox, details);
    if (ownsTask(task)) row.append(remove);
    taskList.append(row);
  }
  updateCounts();
}

function updateCounts() {
  const done = tasks.filter(task => task.done).length;
  const remaining = tasks.length - done;
  document.querySelector('#task-count').textContent = tasks.length;
  document.querySelector('#remaining-count').textContent = `${remaining} task${remaining === 1 ? '' : 's'} remaining`;
  document.querySelector('#progress-label').textContent = tasks.length ? `${done} of ${tasks.length} complete${done === tasks.length ? ' · Nice work!' : ''}` : 'Ready when you are';
  document.querySelector('#empty-state').hidden = tasks.length > 0;
}

loginForm.addEventListener('submit', event => {
  event.preventDefault();
  const nameInput = document.querySelector('#username');
  const passwordInput = document.querySelector('#password');
  const error = document.querySelector('#login-error');
  const name = nameInput.value.trim();
  if (!name) {
    error.textContent = 'Please enter a username.';
    nameInput.focus();
    return;
  }
  // A shared, client-side access gate; this is not secure authentication.
  if (passwordInput.value !== 'VWB123') {
    error.textContent = 'That password isn’t correct. Please try again.';
    passwordInput.setAttribute('aria-invalid', 'true');
    passwordInput.focus();
    return;
  }
  username = name;
  error.textContent = '';
  passwordInput.removeAttribute('aria-invalid');
  passwordInput.value = '';
  tasks = [];
  storageError.textContent = '';
  try {
    loadTasks();
    migrateTasks();
  } catch {
    storageError.textContent = 'Saved tasks could not be loaded. New tasks will stay here while this tab is open.';
  }
  document.querySelector('#display-name').textContent = username;
  loginScreen.hidden = true;
  taskScreen.hidden = false;
  renderTasks();
  taskInput.focus();
});

taskForm.addEventListener('submit', event => {
  event.preventDefault();
  const text = taskInput.value.trim();
  if (!text) {
    taskInput.setCustomValidity('Enter a task before adding it.');
    taskInput.reportValidity();
    return;
  }
  tasks.push({ id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`, text, done: false, author: username });
  saveTasks();
  renderTasks();
  taskForm.reset();
  taskInput.focus();
  document.querySelector('#task-announcement').textContent = 'Task added.';
});

taskInput.addEventListener('input', () => taskInput.setCustomValidity(''));

window.addEventListener('storage', event => {
  if (!username || (event.key !== sharedStorageKey && event.key !== null)) return;
  try {
    loadTasks();
    renderTasks();
    storageError.textContent = '';
  } catch {
    storageError.textContent = 'Shared tasks could not be refreshed. Please reload to try again.';
  }
});

document.querySelector('#logout-button').addEventListener('click', () => {
  username = '';
  tasks = [];
  taskList.replaceChildren();
  taskForm.reset();
  loginForm.reset();
  taskScreen.hidden = true;
  loginScreen.hidden = false;
  document.querySelector('#username').focus();
});
