const API_BASE = 'https://hacker-news.firebaseio.com/v0/',
    _ = {
        el(tag, cls, parent) {
            const el = document.createElement(tag);
            if (cls)
                el.classList.add(...cls);
            if (parent)
                parent.appendChild(el);
            return el;
        },
        text(content, parent) {
            parent.textContent = content;
        },
        link(parent, url) {
            const textEl = _.el('a');
            while (parent.firstChild) {
                textEl.appendChild(parent.firstChild);
            }
            parent.appendChild(textEl);
            textEl.addEventListener('click', e => {
                console.log(e)
                electron.shell.openExternal(url);
                e.preventDefault();
                const win = electron.remote.getCurrentWindow();
                if (win.isFocused() && (linkBehavior == 'behind' ||
                                       (!e.isTrusted && linkBehavior == 'kb-behind'))) {
                    win.setAlwaysOnTop(true);
                    win.once('blur', () => {
                        win.focus();
                        win.setAlwaysOnTop(false);
                    });
                }
            });
            textEl.href = url;
        },
        blocks(min, max, parent, minWords, maxWords) {
            const arrayLen = n => { const a = []; for (let i = 0; i < n; i++) a.push(undefined); return a; }
            minWords = minWords || 1;
            maxWords = maxWords || 1;
            parent.textContent =
                arrayLen(Math.floor(Math.random() * (maxWords - minWords)) + minWords)
                    .map(x => arrayLen(Math.floor(Math.random() * (max - min)) + min).join('▉'))
                    .join('\u2003');
        },
        pl: n => n == 1 ? '' : 's',
        plf: n => _.pl(Math.floor(n)),
        timedelta(epoch, parent) {
            let ref;
            _.text('', parent);
            const smallText = _.el('span', ['small-only'], parent),
                wideText = _.el('span', ['wide-only'], parent),
                update = () => {
                if (!document.body.contains(parent))
                    clearTimeout(ref);
                const d = (new Date() / 1000 - epoch) / (60);
                if (d < 1) {
                    _.text('just now', wideText);
                    _.text('now', smallText);
                } else if (d < 60) {
                    _.text(Math.floor(d) + ' minute' +
                          _.plf(d) + ' ago', wideText);
                    _.text(Math.floor(d) + 'm', smallText);
                } else if (d < (60 * 24)) {
                    _.text(Math.floor((d / 60)) + ' hour' +
                          _.plf(d / 60) + ' ago', wideText);
                    _.text(Math.floor((d / 60)) + 'h', smallText);
                } else {
                    _.text(Math.floor((d / 60 / 24)) + ' day' +
                          _.plf(d / 60 / 24) + ' ago', wideText);
                    _.text(Math.floor((d / 60 / 24)) + 'd', smallText);
                }
            }
            ref = setTimeout(update, 1000 * 60);
            update();
        },
        colorizeScore(n) {
            if (n == 0 || n == 1) return '#888';
            const lv = Math.log(n);
            return 'hsl(' + Math.round(70 - lv * 15) + ', ' + (20 + lv * 10) + '%, ' + (40 + lv * 2) + '%)';
        }
    },
    electron = require('electron'),
    storage = require('electron-json-storage');

let linkBehavior, movementKeys;

electron.webFrame.setVisualZoomLevelLimits(1, 1)

class NewsItem {
    constructor(item, mode, focusListener) {
        this.id = item;
        this.mode = mode;
        this.focusListener = focusListener;
        this.el       = _.el('div', ['entry', 'unrealized']);
        this.el.setAttribute('tabindex', '0')
        this.el.addEventListener('click', () => { this.el.focus(); })

        this.headline = _.el('h2', ['headline'], this.el);
        this.metadata = _.el('div', ['metadata'], this.el);

        this.points   = _.el('span', ['points'], this.metadata);
        this.sep1     = _.el('span', ['separator'], this.metadata);
        this.time     = _.el('span', ['time'], this.metadata);
        this.sep2     = _.el('span', ['separator'], this.metadata);
        this.creator  = _.el('span', ['creator'], this.metadata);
        this.sep3     = _.el('span', ['separator'], this.metadata);
        this.comments = _.el('span', ['comments'], this.metadata);

        this.el.style.minHeight = '3em';
        this.addObserver();
    }
    realize(data) {
        if (this.mode == 'show')
            _.text(data.title.replace(/^Show HN: /, ''), this.headline);
        else if (this.mode == 'ask')
            _.text(data.title.replace(/^Ask HN: /, ''), this.headline);
        else
            _.text(data.title, this.headline);

        _.link(this.headline, data.url || 'https://news.ycombinator.com/item?id=' + this.id);

        _.timedelta(data.time, this.time);

        if (typeof data.descendants !== 'undefined') {
            _.text('', this.points);
            _.text(data.score + ' point' + _.pl(data.score), _.el('span', ['wide-only'], this.points));
            _.text(data.score, _.el('span', ['small-only'], this.points));
            if (data.score > 1)
                this.el.style.setProperty('--accent-color', _.colorizeScore(data.score));
        } else {
            _.text('job', this.points);
            this.points.classList.add('job');
        }

        _.text(data.by, this.creator);
        _.link(this.creator, 'https://news.ycombinator.com/user?id=' + data.by);

        if (typeof data.descendants !== 'undefined') {
            _.text('', this.comments);
            _.text(data.descendants + ' comment' + _.pl(data.descendants),
                _.el('span', ['wide-only'], this.comments));
            _.text(data.descendants + 'c',
                _.el('span', ['small-only'], this.comments));
            _.link(this.comments, 'https://news.ycombinator.com/item?id=' + this.id);
        } else {
            this.metadata.removeChild(this.sep3);
            this.metadata.removeChild(this.comments);
        }

        this.el.classList.remove('unrealized');
        delete this.el.style.minHeight;
    }
    addObserver() {
        new IntersectionObserver(([e], observer) => {
            if (e.isIntersecting) {
                observer.unobserve(e.target);

                _.blocks(3, 9, this.headline, 3, 6);
                _.blocks(5, 6, this.points);
                _.blocks(5, 10, this.time);
                _.blocks(5, 10, this.creator);
                _.blocks(5, 10, this.comments);

                fetch(API_BASE + 'item/' + this.id + '.json')
                .then(x => x.json())
                .then(data => {
                    this.realize(data);
                })
            }
        }, {
            root: document.querySelector('.main-wrapper'),
            rootMargin: '1000px',
            threshold: 1.0
        }).observe(this.el);
    }
    focus() {
        this.el.focus();
        this.el.scrollIntoView({ smooth: false });
        this.focusListener(this);
    }
    registerSiblings(prev, next) {
        this.el.addEventListener('keypress', e => {
            if (prev && e.key == keyNavigation[1])
                prev.focus();
            else if (next && e.key == keyNavigation[0])
                next.focus();
            else if (e.key == 'Enter')
                this.headline.querySelector('a').click();
            else if (e.key == 'u')
                this.metadata.querySelector('.creator a').click();
            else if (e.key == 'c')
                this.metadata.querySelector('.comments a') &&
                    this.metadata.querySelector('.comments a').click();
            e.cancelBubble = true;
        })
    }
}

class NewsReader {
    constructor(el, handle) {
        this.iteration = 0;
        this.el = el;
        this.handle = handle;

        document.body.addEventListener('keypress', e => {
            if (!this.lastFocused)
                return;
            if (e.key == keyNavigation[1] || e.key == keyNavigation[0])
                this.lastFocused.focus();
        })
    }
    realizeView(type, name) {
        const iteration = ++this.iteration;
        while (this.el.firstChild)
            this.el.removeChild(this.el.firstChild);
        this.el.classList.add('loading');
        fetch(API_BASE + type + 'stories.json')
        .then(x => x.json())
        .then(stories => {
            this.el.classList.remove('loading');
            if (this.iteration != iteration)
                return;
            document.querySelector('title').innerHTML = name + ' — Neues';
            const el = document.createElement('div'),
                focusListener = x => {
                    this.lastFocused = x;
                }
            while (this.el.firstChild)
                this.el.removeChild(this.el.firstChild);
            this.el.appendChild(el);
            this.el.parentNode.scrollTo(0, 0);
            const first = new NewsItem(stories[0], type, focusListener)
            el.appendChild(first.el);
            first.focus();
            let prev2 = null, prev1 = first;
            for (const data of stories.slice(1)) {
                const item = new NewsItem(data, type, focusListener);
                el.appendChild(item.el);
                prev1.registerSiblings(prev2, item);
                prev2 = prev1;
                prev1 = item;
            }
            prev1.registerSiblings(prev2, null);
            _.text('❦', _.el('span', ['fleuron'], el));
        })
    }
}

class FeedSelector {
    constructor(el) {
        this.el = _.el('div', ['selector', 'feed-selector'], el);
        this.feeds = [
            ['top', 'Top'],
            ['new', 'New'],
            ['best', 'Best'],
            ['ask', 'Ask'],
            ['show', 'Show'],
            ['job', 'Jobs'],
        ]
        storage.get('view', (error, view) => {
            if (typeof view != 'string')
                view = false;
            this.feed = view || 'top';
            this.cb(...this.feeds.find(x => x[0] == this.feed));
            this.render();
        });
    }
    attachMenu(menu, updateMenu) {
        this.menu = menu;
        this.menuCb = updateMenu;
        this.updateMenu();
    }
    updateMenu() {
        this.menu.submenu = [];
        for (const [idx, [id, name]] of Object.entries(this.feeds)) {
            this.menu.submenu.push({
                label: name,
                type: 'radio',
                checked: id == this.feed,
                accelerator: 'CmdOrCtrl+' + (+idx + 1),
                click: () => {
                    this.feed = id;
                    this.update();
                    this.cb(...this.feeds.find(x => x[0] == this.feed));
                    storage.set('view', this.feed);
                }
            })
        }
        this.menuCb();
    }
    render() {
        while (this.el.firstChild) this.el.removeChild(this.el.firstChild);
        for (const [id, name] of this.feeds) {
            const feedButton = _.el('button', [], this.el);
            _.text(name, feedButton);
            feedButton.setAttribute('data-id', id);
            feedButton.addEventListener('click', () => {
                this.feed = id;
                this.update();
                this.cb(...this.feeds.find(x => x[0] == this.feed));
                storage.set('view', this.feed);
                this.updateMenu();
            });
        }
        this.update();
    }
    update() {
        this.el.childNodes.forEach(x => {
            x.classList.toggle('selected', x.getAttribute('data-id') == this.feed)
        });
    }
    on(cb) {
        this.cb = cb;
        if (this.feed)
            this.cb(...this.feeds.find(x => x[0] == this.feed));
    }
}

class SettingsView {
    constructor(el) {
        this.el = _.el('div', ['selector', 'style-selector'], el);
        this.styles = [ 'dark', 'semidark', 'semilight', 'light', 'sepia', 'mocha', 'solarized-light', 'solarized-dark', 'midnight' ]
        storage.get('style', (error, style) => {
            if (this.styles.includes(style))
                this.style = style;
            else {
                this.style = 'dark';
                storage.set('style', 'dark');
            }
            this.render();
            this.updateStyle();
        })
    }
    setStyle(id) {
        this.style = id;
        this.updateStyle();
        this.update();
        storage.set('style', id, () => {});
        this.cb && this.cb(id);
    }
    render() {
        while (this.el.firstChild) this.el.removeChild(this.el.firstChild);
        for (const id of this.styles) {
            const feedButton = _.el('button', [id], this.el);
            _.text(name, feedButton);
            feedButton.setAttribute('data-id', id);
            feedButton.addEventListener('click', () => {
                this.setStyle(id)
            });
        }
        this.update();
    }
    update() {
        let last = null;
        this.el.childNodes.forEach(x => {
            x.classList.toggle('selected', x.getAttribute('data-id') == this.style);
            x.classList.remove('after-selected', 'before-selected');
            if (last == true)
                x.classList.add('after-selected')
            if (x.getAttribute('data-id') == this.style) {
                if (last)
                    last.classList.add('before-selected')
                last = true;
            } else {
                last = x;
            }
        });
    }
    updateStyle() {
        document.body.classList.remove(...this.styles);
        document.body.classList.add(...this.style.split(' '));
        electron.ipcRenderer.send('style', this.style)
    }
    on(cb) {
        this.cb = cb;
    }
}

window.addEventListener('load', () => {
    const reader = new NewsReader(document.body.querySelector('main')),
        feedSelector = new FeedSelector(document.body.querySelector('.handle')),
        settingsView = new SettingsView(document.body.querySelector('.handle'));

    feedSelector.on((...x) => reader.realizeView(...x));

    let zoomAction;
    storage.getAll((error, {
            fontSize,
            style,
            linkBehavior: _linkBehavior,
            keyNavigation: _keyNavigation
        }) => {
        fontSize = Number(fontSize) || 16;
        document.body.style.fontSize = fontSize + 'px';
        zoomAction = v => {
            if (v == 0)
                fontSize = 16;
            else
                fontSize += v;
            if (fontSize < 10) fontSize = 10;
            if (fontSize > 30) fontSize = 30;
            document.body.style.fontSize = fontSize + 'px';
            storage.set('fontSize', fontSize);
        };

        linkBehavior = typeof _linkBehavior == 'string' ? _linkBehavior : 'behind';
        keyNavigation = typeof _keyNavigation == 'string' ? _keyNavigation : null;

        const tpl = [
            {
                label: 'View',
                submenu: [
                    {role: 'togglefullscreen'},
                    {type: 'separator'},
                    {label: 'Zoom In',
                     accelerator: 'CmdOrCtrl+Plus',
                     click() { zoomAction && zoomAction(1); } },
                    {label: 'Zoom Out',
                     accelerator: 'CmdOrCtrl+-',
                     click() { zoomAction && zoomAction(-1); } },
                    {label: 'Actual Size',
                     accelerator: 'CmdOrCtrl+0',
                     click() { zoomAction && zoomAction(0); } },
                    {type: 'separator'},
                    {label: 'Style',
                     submenu: [] },
                    {label: 'Open Links...',
                     submenu: [] },
                    {label: 'Key Navigation...',
                     submenu: [] },
                    {type: 'separator'},
                    {role: 'reload'},
                ]
            },
            {
                label: 'Feeds',
                submenu: []
            },
            {
                role: 'window',
                submenu: [
                    {role: 'minimize'},
                    {role: 'close'}
                ]
            },
            {
                role: 'help',
                submenu: []
            }

        ];
        if (process.platform === 'darwin') {
            tpl.unshift({
                label: 'Neues',
                submenu: [
                    {role: 'about'},
                    {type: 'separator'},
                    {role: 'services', submenu: []},
                    {type: 'separator'},
                    {role: 'hide'},
                    {role: 'hideothers'},
                    {role: 'unhide'},
                    {type: 'separator'},
                    {role: 'toggledevtools'},
                    {type: 'separator'},
                    {role: 'quit'}
                ]
            });
        }
        const viewMenu = tpl.find(x => x.label == 'View'),
            styleMenu = viewMenu.submenu.find(x => x.label == 'Style'),
            linkBehaviorMenu = viewMenu.submenu.find(x => x.label == 'Open Links...'),
            keyNavigationMenu = viewMenu.submenu.find(x => x.label == 'Key Navigation...'),
            feedsMenu = tpl.find(x => x.label == 'Feeds');
        let maybeUpdateMenu = () => {};

        let lastMenuUpdatedStyle = style;
        const styles = [
            {id: 'dark', name: 'Dark'},
            {id: 'semidark', name: 'Semidark'},
            {id: 'semilight', name: 'Semilight'},
            {id: 'light', name: 'Light'},
            {id: 'sepia', name: 'Sepia'},
            {id: 'mocha', name: 'Mocha'},
            {id: 'solarized-light', name: 'Solarized Light'},
            {id: 'solarized-dark', name: 'Solarized Dark'},
            {id: 'midnight', name: 'Midnight'}
        ], buildStyleItems = style => {
            styleMenu.submenu = [];
            for (const [idx, {id, name}] of Object.entries(styles)) {
                styleMenu.submenu.push({
                    label: name,
                    type: 'radio',
                    accelerator: 'CmdOrCtrl+Option+' + (+idx + 1),
                    checked: id == style,
                    click: () => {
                        lastMenuUpdatedStyle = id;
                        settingsView.setStyle(id);
                    }
                });
                maybeUpdateMenu();
            }
        }
        settingsView.on(style => {
            if (lastMenuUpdatedStyle == style)
                return;
            setTimeout(() => buildStyleItems(style), 10);
        })
        buildStyleItems();

        const behaviors = [
            {id: 'behind', name: 'Behind Neues'},
            {id: 'kb-behind', name: 'Behind Neues only when using keyboard'},
            {id: 'front', name: 'In front of Neues'},
        ], buildLinkBehaviorItems = behavior => {
            linkBehaviorMenu.submenu = [];
            for (const {id, name} of behaviors) {
                linkBehaviorMenu.submenu.push({
                    label: name,
                    type: 'radio',
                    checked: id == behavior,
                    click: () => {
                        linkBehavior = id;
                        storage.set('linkBehavior', id, () => {});
                    }
                });
                maybeUpdateMenu();
            }
        }
        buildLinkBehaviorItems(linkBehavior);

        const keysets = [
            {id: null, name: 'None'},
            {id: 'jk', name: 'j/k'},
            {id: 'ht', name: 'h/t'},
            {id: 'ne', name: 'n/e'},
            {id: 'nr', name: 'n/r'},
        ], buildKeyNavigationItems = () => {
            keyNavigationMenu.submenu = [];
            for (const {id, name} of keysets) {
                console.log(id, name)
                keyNavigationMenu.submenu.push({
                    label: name,
                    type: 'radio',
                    checked: id === keyNavigation,
                    click: () => {
                        keyNavigation = id;
                        buildKeyNavigationItems();
                        storage.set('keyNavigation', id, () => {});
                    }
                });
            }
            maybeUpdateMenu();
        }
        buildKeyNavigationItems();

        feedSelector.attachMenu(feedsMenu, () => maybeUpdateMenu());

        maybeUpdateMenu = () => electron.remote.Menu.setApplicationMenu(electron.remote.Menu.buildFromTemplate(tpl));
        maybeUpdateMenu();
    });
});
