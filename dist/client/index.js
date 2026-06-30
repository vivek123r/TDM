"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const blessed_1 = __importDefault(require("blessed"));
const apiClient_1 = require("./apiClient");
const format_1 = require("../utils/format");
const config_1 = require("../config");
async function main() {
    const apiClient = new apiClient_1.ApiClient();
    // 1. Blessed Screen Setup
    const screen = blessed_1.default.screen({
        smartCSR: true,
        title: 'tdown (Terminal Download Manager)',
        dockBorders: true,
    });
    // State
    let downloads = [];
    let activeItems = [];
    let queueItems = [];
    let currentStats;
    let activePanel = 'active';
    let searchQuery = '';
    let filterMode = 'all';
    // 2. UI Layout Components
    // Header Box
    const headerBox = blessed_1.default.box({
        parent: screen,
        top: 0,
        left: 0,
        width: '100%',
        height: 3,
        border: 'line',
        tags: true,
        style: {
            border: { fg: 'grey' },
            bg: 'black',
        },
    });
    // Active Downloads Box (Border and container)
    const activeBox = blessed_1.default.box({
        parent: screen,
        top: 3,
        left: 0,
        width: '100%',
        height: '50%',
        border: 'line',
        label: ' Active Downloads ',
        style: {
            border: { fg: 'cyan' },
            label: { fg: 'cyan', bold: true },
        },
    });
    // Active Downloads List Widget
    const activeList = blessed_1.default.list({
        parent: activeBox,
        top: 0,
        left: 0,
        width: '100%-2',
        height: '100%-2',
        keys: true,
        vi: true,
        tags: true,
        mouse: true,
        style: {
            selected: {
                bg: 'blue',
                fg: 'white',
                bold: true,
            },
        },
        scrollbar: {
            ch: ' ',
            track: { bg: 'grey' },
            style: { bg: 'cyan' },
        },
    });
    // Queue Box
    const queueBox = blessed_1.default.box({
        parent: screen,
        top: '53%',
        left: 0,
        width: '100%',
        height: '35%',
        border: 'line',
        label: ' Queue ',
        style: {
            border: { fg: 'grey' },
            label: { fg: 'white' },
        },
    });
    // Queue List Widget
    const queueList = blessed_1.default.list({
        parent: queueBox,
        top: 0,
        left: 0,
        width: '100%-2',
        height: '100%-2',
        keys: true,
        vi: true,
        tags: true,
        mouse: true,
        style: {
            selected: {
                bg: 'blue',
                fg: 'white',
                bold: true,
            },
        },
        scrollbar: {
            ch: ' ',
            track: { bg: 'grey' },
            style: { bg: 'cyan' },
        },
    });
    // Status Bar Box
    const statusBar = blessed_1.default.box({
        parent: screen,
        bottom: 0,
        left: 0,
        width: '100%',
        height: 3,
        border: 'line',
        tags: true,
        style: {
            border: { fg: 'grey' },
            bg: 'black',
        },
    });
    // 3. Popup Windows
    // New Download Dialog
    const newDownloadForm = blessed_1.default.box({
        parent: screen,
        label: ' New Download ',
        border: 'line',
        width: 60,
        height: 12,
        top: 'center',
        left: 'center',
        style: {
            border: { fg: 'cyan' },
            bg: 'black',
            label: { fg: 'cyan', bold: true },
        },
        hidden: true,
    });
    blessed_1.default.text({
        parent: newDownloadForm,
        top: 1,
        left: 2,
        width: '100%-4',
        height: 1,
        content: 'URL:',
        style: { fg: 'white', bold: true },
    });
    const urlInput = blessed_1.default.textbox({
        parent: newDownloadForm,
        top: 2,
        left: 2,
        width: 54,
        height: 1,
        inputOnFocus: true,
        style: {
            bg: 'grey',
            fg: 'white',
        },
    });
    blessed_1.default.text({
        parent: newDownloadForm,
        top: 4,
        left: 2,
        width: '100%-4',
        height: 1,
        content: 'Save To:',
        style: { fg: 'white', bold: true },
    });
    const saveDirInput = blessed_1.default.textbox({
        parent: newDownloadForm,
        top: 5,
        left: 2,
        width: 54,
        height: 1,
        inputOnFocus: true,
        style: {
            bg: 'grey',
            fg: 'white',
        },
    });
    blessed_1.default.text({
        parent: newDownloadForm,
        bottom: 1,
        left: 2,
        width: '100%-4',
        height: 1,
        content: '[ Enter ] Next/Submit  [ Esc ] Cancel',
        style: { fg: 'grey' },
    });
    // Details Modal
    const detailsBox = blessed_1.default.box({
        parent: screen,
        label: ' Download Details ',
        border: 'line',
        width: 70,
        height: 15,
        top: 'center',
        left: 'center',
        style: {
            border: { fg: 'cyan' },
            bg: 'black',
            label: { fg: 'cyan', bold: true },
        },
        hidden: true,
    });
    const detailsText = blessed_1.default.text({
        parent: detailsBox,
        top: 1,
        left: 2,
        right: 2,
        bottom: 2,
        tags: true,
        style: { fg: 'white' },
    });
    // Delete Confirmation Modal
    const confirmBox = blessed_1.default.box({
        parent: screen,
        label: ' Confirm Delete ',
        border: 'line',
        width: 50,
        height: 7,
        top: 'center',
        left: 'center',
        style: {
            border: { fg: 'red' },
            bg: 'black',
            label: { fg: 'red', bold: true },
        },
        hidden: true,
    });
    blessed_1.default.text({
        parent: confirmBox,
        top: 1,
        left: 2,
        width: '100%-4',
        height: 1,
        content: 'Are you sure you want to delete this download?',
        style: { fg: 'white' },
    });
    blessed_1.default.text({
        parent: confirmBox,
        bottom: 1,
        left: 2,
        width: '100%-4',
        height: 2,
        content: '[ y ] Item + Disk File  [ n ] Item Only  [ Esc ] Cancel',
        style: { fg: 'white' },
    });
    // Search Dialog
    const searchForm = blessed_1.default.box({
        parent: screen,
        label: ' Filter/Search ',
        border: 'line',
        width: 45,
        height: 3,
        bottom: 3,
        right: 2,
        style: {
            border: { fg: 'yellow' },
            bg: 'black',
            label: { fg: 'yellow', bold: true },
        },
        hidden: true,
    });
    const searchInput = blessed_1.default.textbox({
        parent: searchForm,
        top: 0,
        left: 1,
        width: 41,
        height: 1,
        inputOnFocus: true,
        style: {
            bg: 'black',
            fg: 'white',
        },
    });
    // Error Alert Modal
    const errorBox = blessed_1.default.box({
        parent: screen,
        label: ' Error ',
        border: 'line',
        width: 55,
        height: 7,
        top: 'center',
        left: 'center',
        style: {
            border: { fg: 'red' },
            bg: 'black',
            label: { fg: 'red', bold: true },
        },
        hidden: true,
    });
    const errorText = blessed_1.default.text({
        parent: errorBox,
        top: 1,
        left: 2,
        right: 2,
        style: { fg: 'white' },
    });
    blessed_1.default.text({
        parent: errorBox,
        bottom: 1,
        left: 2,
        content: '[ Esc / Enter ] Close',
        style: { fg: 'grey' },
    });
    // Helpers
    function isPopupActive() {
        return (!newDownloadForm.hidden ||
            !detailsBox.hidden ||
            !confirmBox.hidden ||
            !searchForm.hidden ||
            !errorBox.hidden);
    }
    function getSelectedItem() {
        if (activePanel === 'active') {
            const idx = activeList.selected;
            if (idx >= 0 && idx < activeItems.length) {
                return activeItems[idx];
            }
        }
        else {
            const idx = queueList.selected;
            if (idx >= 0 && idx < queueItems.length) {
                return queueItems[idx];
            }
        }
        return null;
    }
    function showError(msg) {
        errorText.setContent(msg);
        errorBox.show();
        errorBox.setFront();
        errorBox.focus();
        screen.render();
    }
    // 4. Formatter Utilities
    function padRight(str, length) {
        if (str.length >= length)
            return str.substring(0, length);
        return str + ' '.repeat(length - str.length);
    }
    function padLeft(str, length) {
        if (str.length >= length)
            return str.substring(0, length);
        return ' '.repeat(length - str.length) + str;
    }
    function formatActiveRow(item, width) {
        const contentWidth = width - 4; // account for borders
        let statusSymbol = '▶';
        let statusText = '';
        let speedText = '';
        let symbolColor = '{cyan-fg}';
        if (item.status === 'completed') {
            statusSymbol = '✓';
            statusText = 'Completed';
            symbolColor = '{green-fg}';
        }
        else if (item.status === 'paused') {
            statusSymbol = '⏸';
            statusText = 'Paused';
            symbolColor = '{yellow-fg}';
        }
        else if (item.status === 'failed') {
            statusSymbol = '✖';
            statusText = item.error ? item.error.substring(0, 16) : 'Failed';
            symbolColor = '{red-fg}';
        }
        else if (item.status === 'cancelled') {
            statusSymbol = '✖';
            statusText = 'Cancelled';
            symbolColor = '{red-fg}';
        }
        else if (item.status === 'downloading') {
            statusSymbol = '▶';
            speedText = (0, format_1.formatSpeed)(item.speed);
            statusText = item.eta ? `ETA ${(0, format_1.formatDuration)(item.eta)}` : 'ETA --:--';
            symbolColor = '{green-fg}';
        }
        const displayFilename = item.filename === 'temp_download' ? item.url : item.filename;
        const col1Width = Math.floor(contentWidth * 0.40);
        const col2Width = Math.floor(contentWidth * 0.25);
        const col3Width = Math.floor(contentWidth * 0.15);
        const col4Width = contentWidth - col1Width - col2Width - col3Width;
        let filePart = `${symbolColor}${statusSymbol}{/} ${displayFilename}`;
        let filePartRaw = `${statusSymbol} ${displayFilename}`;
        if (filePartRaw.length > col1Width) {
            const maxFilenameLength = col1Width - 5; // status + space + ...
            const truncatedFilename = displayFilename.substring(0, Math.max(5, maxFilenameLength)) + '...';
            filePart = `${symbolColor}${statusSymbol}{/} ${truncatedFilename}`;
            filePartRaw = `${statusSymbol} ${truncatedFilename}`;
        }
        const progressText = (0, format_1.generateProgressBar)(item.progress, 12);
        const col1 = filePart + ' '.repeat(Math.max(0, col1Width - filePartRaw.length));
        const col2 = padRight(progressText, col2Width);
        const col3 = padLeft(speedText, col3Width);
        const col4 = padLeft(statusText, col4Width);
        return `${col1}${col2}${col3}${col4}`;
    }
    function formatQueueRow(item, width) {
        const contentWidth = width - 4;
        const col1Width = Math.floor(contentWidth * 0.7);
        const col2Width = contentWidth - col1Width - 2; // Subtract space for status icon
        const displayFilename = item.filename === 'temp_download' ? item.url : item.filename;
        let filePart = displayFilename;
        if (filePart.length > col1Width) {
            filePart = filePart.substring(0, Math.max(5, col1Width - 3)) + '...';
        }
        const col1 = padRight(filePart, col1Width);
        const col2 = padLeft('Waiting', col2Width);
        return `{yellow-fg}⏳{/} ${col1}${col2}`;
    }
    // 5. Render Functions
    function renderLists() {
        // Apply filters
        let filtered = downloads;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = downloads.filter((item) => item.filename.toLowerCase().includes(q) || item.url.toLowerCase().includes(q));
        }
        if (filterMode === 'completed') {
            filtered = filtered.filter((item) => ['completed', 'failed', 'cancelled'].includes(item.status));
        }
        // Separate active and queue
        activeItems = filtered.filter((item) => item.status !== 'waiting');
        queueItems = filtered.filter((item) => item.status === 'waiting');
        // Active List Render
        const activeWidth = activeList.width;
        const formattedActive = activeItems.map((item) => formatActiveRow(item, activeWidth));
        const prevActiveSelected = activeList.selected;
        activeList.setItems(formattedActive);
        if (prevActiveSelected >= 0 && prevActiveSelected < formattedActive.length) {
            activeList.select(prevActiveSelected);
        }
        // Queue List Render
        const queueWidth = queueList.width;
        const formattedQueue = queueItems.map((item) => formatQueueRow(item, queueWidth));
        const prevQueueSelected = queueList.selected;
        queueList.setItems(formattedQueue);
        if (prevQueueSelected >= 0 && prevQueueSelected < formattedQueue.length) {
            queueList.select(prevQueueSelected);
        }
        updateHeader();
        updateStatusBar();
        screen.render();
    }
    function updateHeader() {
        const left = ' {bold}SERVER DOWNLOAD MANAGER{/}';
        const statusText = apiClient.connectionStatus
            ? '{green-fg}Connected ●{/}'
            : '{red-fg}Disconnected ○{/}';
        const jobsText = `${downloads.length} Jobs`;
        const filterText = filterMode === 'completed' ? ' [History Only]' : '';
        const searchText = searchQuery ? ` [Search: ${searchQuery}]` : '';
        const right = `${statusText}  ${jobsText}${filterText}${searchText} `;
        const contentWidth = screen.width;
        const rawRightText = `Connected ●  ${jobsText}${filterText}${searchText} `;
        const paddingSize = contentWidth - left.length - rawRightText.length - 2;
        const padding = ' '.repeat(Math.max(0, paddingSize));
        headerBox.setContent(`${left}${padding}${right}`);
    }
    function updateStatusBar() {
        let cpu = '--%';
        let ram = '--MB';
        let net = '↓--B/s';
        let disk = '--%';
        let conn = 'Disconnected ○';
        let connColor = '{red-fg}';
        if (apiClient.connectionStatus && currentStats) {
            cpu = `${currentStats.cpuUsage}%`;
            ram = (0, format_1.formatBytes)(currentStats.ramUsageBytes, 0).replace(' ', '');
            net = `↓${(0, format_1.formatSpeed)(currentStats.networkDownloadSpeed)}`;
            disk = `${currentStats.diskUsagePercent}%`;
            conn = 'Connected ●';
            connColor = '{green-fg}';
        }
        const left = `CPU ${cpu} | RAM ${ram} | NET ${net} | Disk ${disk} | ${connColor}${conn}{/}`;
        const rawLeft = `CPU ${cpu} | RAM ${ram} | NET ${net} | Disk ${disk} | ${conn}`;
        // Responsive key bindings help text based on width
        const screenWidth = screen.width;
        let helpKeys = 'q Quit | n New';
        if (screenWidth >= 120) {
            helpKeys = 'space Pause | enter Info | tab Switch | d Del | n Add | q Quit';
        }
        else if (screenWidth >= 100) {
            helpKeys = 'space Pause | enter Info | tab Switch | d Del | q Quit';
        }
        else if (screenWidth >= 80) {
            helpKeys = 'space Pause | enter Info | q Quit';
        }
        const paddingSize = screenWidth - rawLeft.length - helpKeys.length - 4;
        const padding = ' '.repeat(Math.max(0, paddingSize));
        statusBar.setContent(` ${left}${padding}${helpKeys} `);
    }
    // 6. Form Handlers & Modals
    function openNewDownloadPopup() {
        urlInput.setValue('');
        saveDirInput.setValue(config_1.config.defaultDownloadDir);
        newDownloadForm.show();
        newDownloadForm.setFront();
        urlInput.focus();
        urlInput.readInput();
        screen.render();
    }
    urlInput.on('submit', () => {
        saveDirInput.focus();
        saveDirInput.readInput();
        screen.render();
    });
    saveDirInput.on('submit', async () => {
        const url = urlInput.getValue().trim();
        const saveDir = saveDirInput.getValue().trim();
        if (url) {
            try {
                await apiClient.addDownload(url, saveDir || undefined);
            }
            catch (err) {
                showError(err.message);
            }
        }
        newDownloadForm.hide();
        refocusList();
        screen.render();
    });
    urlInput.on('cancel', () => {
        newDownloadForm.hide();
        refocusList();
        screen.render();
    });
    saveDirInput.on('cancel', () => {
        newDownloadForm.hide();
        refocusList();
        screen.render();
    });
    function openDetailsPopup() {
        const item = getSelectedItem();
        if (!item)
            return;
        const content = [
            `{bold}ID:{/}       ${item.id}`,
            `{bold}URL:{/}      ${item.url}`,
            `{bold}Filename:{/} ${item.filename}`,
            `{bold}Save Dir:{/} ${item.saveDir}`,
            `{bold}Status:{/}   ${item.status.toUpperCase()}`,
            `{bold}Progress:{/} ${item.progress}% (${(0, format_1.formatBytes)(item.downloadedBytes)} / ${item.totalBytes ? (0, format_1.formatBytes)(item.totalBytes) : 'Unknown'})`,
            `{bold}Speed:{/}    ${(0, format_1.formatSpeed)(item.speed)}`,
            `{bold}ETA:{/}      ${item.eta ? (0, format_1.formatDuration)(item.eta) : '--:--'}`,
            `{bold}Created:{/}  ${new Date(item.createdAt).toLocaleString()}`,
            item.completedAt ? `{bold}Finished:{/} ${new Date(item.completedAt).toLocaleString()}` : '',
            item.error ? `{bold}Error:{/}    {red-fg}${item.error}{/}` : '',
        ]
            .filter(Boolean)
            .join('\n');
        detailsText.setContent(content);
        detailsBox.show();
        detailsBox.setFront();
        detailsBox.focus();
        screen.render();
    }
    detailsBox.key(['escape', 'enter'], () => {
        detailsBox.hide();
        refocusList();
        screen.render();
    });
    function openDeleteConfirm() {
        const item = getSelectedItem();
        if (!item)
            return;
        confirmBox.show();
        confirmBox.setFront();
        confirmBox.focus();
        screen.render();
    }
    confirmBox.key(['y', 'Y'], async () => {
        const item = getSelectedItem();
        if (item) {
            try {
                await apiClient.deleteDownload(item.id, true);
            }
            catch (err) {
                showError(err.message);
            }
        }
        confirmBox.hide();
        refocusList();
        screen.render();
    });
    confirmBox.key(['n', 'N'], async () => {
        const item = getSelectedItem();
        if (item) {
            try {
                await apiClient.deleteDownload(item.id, false);
            }
            catch (err) {
                showError(err.message);
            }
        }
        confirmBox.hide();
        refocusList();
        screen.render();
    });
    confirmBox.key(['escape'], () => {
        confirmBox.hide();
        refocusList();
        screen.render();
    });
    function openSearchPopup() {
        searchInput.setValue(searchQuery);
        searchForm.show();
        searchForm.setFront();
        searchInput.focus();
        searchInput.readInput();
        screen.render();
    }
    searchInput.on('submit', () => {
        searchQuery = searchInput.getValue().trim();
        searchForm.hide();
        refocusList();
        renderLists();
    });
    searchInput.on('cancel', () => {
        searchQuery = '';
        searchInput.setValue('');
        searchForm.hide();
        refocusList();
        renderLists();
    });
    errorBox.key(['escape', 'enter'], () => {
        errorBox.hide();
        refocusList();
        screen.render();
    });
    function refocusList() {
        if (activePanel === 'active') {
            activeList.focus();
        }
        else {
            queueList.focus();
        }
    }
    // 7. Global Keyboard Navigation and Command Router
    screen.key(['tab'], () => {
        if (isPopupActive())
            return;
        if (activePanel === 'active') {
            activePanel = 'queue';
            activeBox.style.border.fg = 'grey';
            activeBox.style.label.fg = 'white';
            queueBox.style.border.fg = 'cyan';
            queueBox.style.label.fg = 'cyan';
            queueList.focus();
        }
        else {
            activePanel = 'active';
            activeBox.style.border.fg = 'cyan';
            activeBox.style.label.fg = 'cyan';
            queueBox.style.border.fg = 'grey';
            queueBox.style.label.fg = 'white';
            activeList.focus();
        }
        screen.render();
    });
    // Quit
    screen.key(['q', 'Q', 'C-c'], () => {
        apiClient.close();
        screen.destroy();
        process.exit(0);
    });
    // Command Shortcuts
    screen.key(['n', 'N'], () => {
        if (isPopupActive())
            return;
        openNewDownloadPopup();
    });
    const triggerDetails = () => {
        if (isPopupActive())
            return;
        openDetailsPopup();
    };
    const triggerSpaceAction = async () => {
        if (isPopupActive())
            return;
        const item = getSelectedItem();
        if (!item)
            return;
        try {
            if (item.status === 'downloading') {
                await apiClient.pauseDownload(item.id);
            }
            else if (['paused', 'failed', 'cancelled'].includes(item.status)) {
                await apiClient.resumeDownload(item.id);
            }
        }
        catch (err) {
            showError(err.message);
        }
    };
    // Bind Enter and Space to screen, activeList, and queueList to bypass Blessed defaults
    screen.key(['enter'], triggerDetails);
    activeList.key(['enter'], triggerDetails);
    queueList.key(['enter'], triggerDetails);
    screen.key(['space'], triggerSpaceAction);
    activeList.key(['space'], triggerSpaceAction);
    queueList.key(['space'], triggerSpaceAction);
    screen.key(['d', 'D'], () => {
        if (isPopupActive())
            return;
        openDeleteConfirm();
    });
    screen.key(['/'], () => {
        if (isPopupActive())
            return;
        openSearchPopup();
    });
    screen.key(['c', 'C'], async () => {
        if (isPopupActive())
            return;
        const item = getSelectedItem();
        if (!item)
            return;
        try {
            if (item.status === 'downloading') {
                await apiClient.cancelDownload(item.id);
            }
        }
        catch (err) {
            showError(err.message);
        }
    });
    screen.key(['r', 'R'], async () => {
        if (isPopupActive())
            return;
        const item = getSelectedItem();
        if (!item)
            return;
        try {
            if (['failed', 'cancelled', 'paused'].includes(item.status)) {
                await apiClient.retryDownload(item.id);
            }
        }
        catch (err) {
            showError(err.message);
        }
    });
    screen.key(['h', 'H'], () => {
        if (isPopupActive())
            return;
        filterMode = filterMode === 'all' ? 'completed' : 'all';
        renderLists();
    });
    screen.key(['escape'], () => {
        if (searchQuery) {
            searchQuery = '';
            renderLists();
        }
    });
    // Handle terminal resizing
    screen.on('resize', () => {
        renderLists();
    });
    // 8. API Client Event Hooking
    apiClient.on('connected', () => {
        renderLists();
    });
    apiClient.on('disconnected', () => {
        currentStats = undefined;
        renderLists();
    });
    apiClient.on('message', (msg) => {
        if (msg.type === 'init') {
            downloads = msg.downloads;
            currentStats = msg.stats;
            renderLists();
        }
        else if (msg.type === 'update') {
            const idx = downloads.findIndex((d) => d.id === msg.item.id);
            if (idx >= 0) {
                downloads[idx] = msg.item;
            }
            else {
                downloads.push(msg.item);
            }
            renderLists();
        }
        else if (msg.type === 'delete') {
            downloads = downloads.filter((d) => d.id !== msg.id);
            renderLists();
        }
        else if (msg.type === 'stats') {
            currentStats = msg.stats;
            updateStatusBar();
        }
    });
    // Initial draw
    updateHeader();
    updateStatusBar();
    activeList.focus();
    screen.render();
    // Connect to daemon
    apiClient.connect();
}
main().catch((err) => {
    console.error('[TUI Fatal Error]:', err);
    process.exit(1);
});
