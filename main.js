const {app, BrowserWindow, Menu} = require('electron'),
    path = require('path'),
    url = require('url'),
    storage = require('electron-json-storage');

let win;

function createWindow() {
    storage.get('style', (error, style) => {
        const bgColor = {
            'dark': '#222',
            'semidark': '#555',
            'semilight': '#CCC',
            'light': '#FFF',
            'sepia': '#F8EFDF',
            'mocha': '#320',
            'solarized-dark': '#073642',
            'solarized-light': '#eee8d5',
            'midnight': '#162032',
        }[style] || '#222';

        win = new BrowserWindow({
            width: 500,
            height: 800,
            minWidth: 400,
            titleBarStyle: 'hiddenInset',
            backgroundColor: bgColor,
            show: false
        });

        win.loadURL(url.format({
            pathname: path.join(__dirname, 'index.html'),
            protocol: 'file:',
            slashes: true
        }));
        win.once('ready-to-show', () => {
            win.show()
        })

    });
}

app.on('ready', createWindow);
