// Auth check — redirects to /login if authentication is required and user is not logged in
(function() {
    fetch('/api/v1/auth/status', { credentials: 'same-origin' })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.authRequired && !data.user) {
                window.location.href = '/login';
                return;
            }
            if (data.user) {
                window.__user = data.user;
                var nav = document.querySelector('nav ul') || document.querySelector('.main-nav');
                if (nav && data.user.role === 'admin') {
                    var li = document.createElement('a');
                    li.href = '/admin';
                    li.className = 'nav-link';
                    li.textContent = 'Admin';
                    nav.appendChild(li);
                }
                var logoutLink = document.createElement('a');
                logoutLink.href = '#';
                logoutLink.className = 'nav-link';
                logoutLink.textContent = 'Logout';
                logoutLink.addEventListener('click', function(e) {
                    e.preventDefault();
                    if (window.TaskAPI) TaskAPI.logout();
                });
                if (nav) nav.appendChild(logoutLink);
            }
        })
        .catch(function() {});
})();
