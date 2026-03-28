const statusEl = document.getElementById('status');

async function checkBackend() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    statusEl.textContent = `Backend: ${data.status} | Database: ${data.database}`;
    statusEl.className = 'ok';
  } catch (err) {
    statusEl.textContent = 'No s\'ha pogut connectar amb el backend.';
    statusEl.className = 'error';
  }
}

checkBackend();
