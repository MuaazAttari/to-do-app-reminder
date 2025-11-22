const todoForm = document.getElementById('todo-form');
const todoInput = document.getElementById('todo-input');
const todoTime = document.getElementById('todo-time');
const todoListUL = document.getElementById('todo-list');

let vapidPublicKey;

// Get public key from server
fetch('/vapidPublicKey')
  .then(res => res.text())
  .then(key => vapidPublicKey = key)
  .then(() => subscribeUser());

// Subscribe user for push notifications
async function subscribeUser() {
    if (!('serviceWorker' in navigator)) return console.warn('SW not supported');

    const register = await navigator.serviceWorker.register('service-worker.js');

    const subscription = await register.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
    });

    await fetch('/subscribe', {
        method:'POST',
        body: JSON.stringify({subscription}),
        headers:{'Content-Type':'application/json'}
    });
    console.log('User subscribed for push notifications!');
}

// Helper function for key conversion
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

// Form submit
todoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = todoInput.value.trim();
    const due = todoTime.value;

    if (!text || !due) return;

    const id = 'task-' + Date.now();

    // Add to UI
    addTaskToUI(id, text);

    // Schedule on server
    await fetch('/schedule', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ task: { id, title: text, due } })
    });

    todoInput.value = '';
    todoTime.value = '';
});

// Function to add task in UI
function addTaskToUI(id, text){
    const li = document.createElement('li');
    li.className = 'todo';
    li.id = id;

    const span = document.createElement('span');
    span.className = 'todo-text';
    span.textContent = text;

    const btn = document.createElement('button');
    btn.className = 'delete-button';
    btn.innerHTML = '❌';
    btn.addEventListener('click', async () => {
        li.remove();
        await fetch('/cancel', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({id})
        });
    });

    li.appendChild(span);
    li.appendChild(btn);
    todoListUL.appendChild(li);
}
