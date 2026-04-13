// PWA Service Worker Registration
// Debug-Logging: nur aktiv wenn localStorage.debug === 'true'
var debug = (localStorage.getItem('debug') === 'true') ? console.log.bind(console) : function() {};

(function() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function() {
            navigator.serviceWorker.register('/sw.js')
                .then(function(registration) {
                    registration.addEventListener('updatefound', function() {
                        var newWorker = registration.installing;
                        newWorker.addEventListener('statechange', function() {
                            if (newWorker.state === 'activated') {
                                debug('[PWA] Neuer Service Worker aktiviert');
                            }
                        });
                    });
                    debug('[PWA] Service Worker registriert:', registration.scope);
                })
                .catch(function(error) {
                    console.warn('[PWA] Service Worker Registration fehlgeschlagen:', error);
                });
        });
    }
})();
