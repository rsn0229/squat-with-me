const app = {
    config: {
        googleClientId: "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com", 
        gasWebAppUrl: "YOUR_GAS_WEB_APP_URL" 
    },

    state: {
        mode: 'squat',
        streak: parseInt(localStorage.getItem('swm_streak') || '0'),
        lastDate: localStorage.getItem('swm_last_date') || '',
        sets: 3, reps: 10, rest: 30,
        currentSet: 1, currentProgress: 0,
        
        isWorkingOut: false, timer: null,
        wasWorkingOut: false, 
        
        isManualMode: false,
        
        motionHandler: null,
        holdState: { left: false, right: false },
        holdTimer: null,
        holdProgress: 0,
        
        workoutStartTime: 0,
        workoutLogs: JSON.parse(localStorage.getItem('swm_logs') || '{}'),
        currentCalDate: new Date(),
        oshiName: localStorage.getItem('swm_oshi_name') || 'ME!',
        
        sensorSensitivity: parseInt(localStorage.getItem('swm_sensitivity') || '5'),
        baseG: 9.81, 
        calibValues: [],
        tempMotionHandler: null,
        
        images: JSON.parse(localStorage.getItem('swm_images') || '{"main":"","workout":"","finish":""}'),
        colors: JSON.parse(localStorage.getItem('swm_colors') || '{"bg":"#f5f5f5","box":"#ffffff","title":"#61b8f2","squat":"#61b8f2","plank":"#fff1a8","calendar":"#3b82f6","element":"#ffffff"}'),
        palette: JSON.parse(localStorage.getItem('swm_palette') || '[]'),
        quotes: JSON.parse(localStorage.getItem('swm_quotes') || '{"main":["오늘도 화이팅!"],"start":["자, 시작해보자고! 🔥"],"cheer":["자세 유지해!","조금만 더! 💦"],"finish":["고생했어! 최고야! ✨"]}'),
        
        googleUser: JSON.parse(localStorage.getItem('swm_google_user') || 'null'),
        mainQuoteTimer: null, cropperInstance: null, cropTarget: ''
    },

    init() {
        this.checkInAppBrowser();
        if (!this.state.colors.element) this.state.colors.element = '#ffffff';
        this.checkStreak(); this.applySavedCustomizations();
        this.renderQuoteList(); this.setDefaultMainQuote(); this.syncColorPicker();
        this.initGoogleAuth();
    },

    checkInAppBrowser() {
        const ua = navigator.userAgent.toLowerCase();
        if (ua.match(/kakaotalk|twitter|instagram|line|facebook|fbav|fban/i)) {
            document.getElementById('inapp-warning').classList.remove('hidden');
        }
    },

    initGoogleAuth() {
        if (typeof google !== 'undefined' && google.accounts) {
            google.accounts.id.initialize({
                client_id: this.config.googleClientId,
                callback: (response) => this.handleGoogleCredential(response)
            });
            this.renderGoogleButton();
        } else { setTimeout(() => this.initGoogleAuth(), 500); }
    },

    renderGoogleButton() {
        const btnContainer = document.getElementById('google-login-btn-container');
        const userInfoBox = document.getElementById('google-user-info');
        
        if (this.state.googleUser) {
            if(btnContainer) btnContainer.classList.add('hidden');
            if(userInfoBox) {
                userInfoBox.classList.remove('hidden');
                document.getElementById('google-user-pic').src = this.state.googleUser.picture || '';
                document.getElementById('google-user-name').innerText = this.state.googleUser.name || '사용자';
                document.getElementById('google-user-email').innerText = this.state.googleUser.email || '';
            }
        } else {
            if(userInfoBox) userInfoBox.classList.add('hidden');
            if(btnContainer) {
                btnContainer.classList.remove('hidden');
                btnContainer.innerHTML = '';
                google.accounts.id.renderButton(btnContainer, { theme: 'outline', size: 'large', text: 'signin_with' });
            }
        }
    },

    parseJwt(token) {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
            return JSON.parse(jsonPayload);
        } catch (e) { return null; }
    },

    handleGoogleCredential(response) {
        const payload = this.parseJwt(response.credential);
        if (payload) {
            const user = { sub: payload.sub, email: payload.email, name: payload.name, picture: payload.picture };
            this.state.googleUser = user;
            localStorage.setItem('swm_google_user', JSON.stringify(user));
            this.renderGoogleButton();
            this.showToast(`${user.name}님 연동 완료! ☁️`);
        }
    },

    logoutGoogle() {
        this.state.googleUser = null;
        localStorage.removeItem('swm_google_user');
        this.renderGoogleButton();
        this.showToast("구글 계정 연동이 해제되었습니다.");
    },

    backupToCloud() {
        if (!this.state.googleUser) { this.showToast("먼저 구글 계정으로 로그인해주세요."); return; }
        if (this.config.gasWebAppUrl.includes("YOUR_GAS")) { this.showToast("GAS 웹 앱 URL이 설정되지 않았습니다."); return; }

        const cloudData = {
            streak: this.state.streak, lastDate: this.state.lastDate, sets: this.state.sets, reps: this.state.reps, rest: this.state.rest,
            workoutLogs: this.state.workoutLogs, oshiName: this.state.oshiName, sensorSensitivity: this.state.sensorSensitivity, 
            colors: this.state.colors, palette: this.state.palette, quotes: this.state.quotes
        };

        this.showToast("☁️ 클라우드에 백업 중...");
        fetch(this.config.gasWebAppUrl, {
            method: 'POST', body: JSON.stringify({ action: 'save', tokenPayload: this.state.googleUser, cloudData: JSON.stringify(cloudData) })
        })
        .then(res => res.json())
        .then(data => {
            if(data.status === 'success') this.showToast("✅ 클라우드 백업 완료!");
            else this.showToast("❌ 백업 실패: " + data.message);
        }).catch(err => { this.showToast("❌ 백업 중 서버 오류가 발생했습니다."); console.error(err); });
    },

    restoreFromCloud() {
        if (!this.state.googleUser) return;
        if(confirm("클라우드 데이터를 불러오시겠습니까?\n현재 기기의 기록과 설정이 모두 덮어씌워집니다.")) {
            this.showToast("⬇️ 클라우드에서 불러오는 중...");
            fetch(this.config.gasWebAppUrl, {
                method: 'POST', body: JSON.stringify({ action: 'load', tokenPayload: this.state.googleUser })
            })
            .then(res => res.json())
            .then(data => {
                if(data.status === 'success' && data.data) {
                    const loaded = JSON.parse(data.data);
                    this.applyCloudData(loaded);
                    this.showToast("✅ 데이터를 성공적으로 불러왔습니다!");
                } else { this.showToast("⚠️ 저장된 백업 데이터가 없습니다."); }
            }).catch(err => this.showToast("❌ 불러오기 실패"));
        }
    },

    applyCloudData(loaded) {
        this.state.streak = loaded.streak || 0; this.state.lastDate = loaded.lastDate || '';
        this.state.sets = loaded.sets || 3; this.state.reps = loaded.reps || 10; this.state.rest = loaded.rest || 30;
        this.state.workoutLogs = loaded.workoutLogs || {}; this.state.oshiName = loaded.oshiName || 'ME!';
        this.state.sensorSensitivity = loaded.sensorSensitivity || 5; this.state.colors = loaded.colors || this.state.colors;
        this.state.palette = loaded.palette || []; this.state.quotes = loaded.quotes || this.state.quotes;

        localStorage.setItem('swm_streak', this.state.streak); localStorage.setItem('swm_last_date', this.state.lastDate);
        localStorage.setItem('swm_logs', JSON.stringify(this.state.workoutLogs)); localStorage.setItem('swm_oshi_name', this.state.oshiName);
        localStorage.setItem('swm_sensitivity', this.state.sensorSensitivity); localStorage.setItem('swm_colors', JSON.stringify(this.state.colors));
        localStorage.setItem('swm_palette', JSON.stringify(this.state.palette)); localStorage.setItem('swm_quotes', JSON.stringify(this.state.quotes));

        this.checkStreak(); this.setDefaultMainQuote(); this.applySavedCustomizations();
        this.renderQuoteList(); this.syncColorPicker();
    },

    switchView(viewId) {
        document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
        document.getElementById(viewId).classList.add('active');
        const header = document.getElementById('main-header');
        if (viewId === 'view-main') header.style.display = 'flex'; else header.style.display = 'none';
    },
    
    openModal(id) { 
        document.getElementById(id).classList.add('active'); 
        if(id === 'calendar-modal') {
            this.state.currentCalDate = new Date();
            document.getElementById('cal-detail-box').classList.add('hidden');
            this.renderCalendar();
        }
    },
    
    closeModal(id) { document.getElementById(id).classList.remove('active'); },
    
    showToast(msg) {
        const toast = document.getElementById('toast-message');
        toast.innerText = msg; toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2000);
    },

    switchTab(tabId) {
        document.querySelectorAll('.tab-panel').forEach(el => { el.classList.remove('active'); el.classList.remove('hidden'); });
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
        document.querySelectorAll('.tab-btn').forEach(btn => { if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(tabId)) { btn.classList.add('active'); } });
        if (tabId === 'tab-sync') { this.renderGoogleButton(); }
    },

    applySavedCustomizations() {
        document.getElementById('oshi-name-display').innerText = this.state.oshiName;
        document.getElementById('input-oshi-name').value = this.state.oshiName;
        
        const senInput = document.getElementById('input-sensor-sensitivity');
        if(senInput) {
            senInput.value = this.state.sensorSensitivity;
            document.getElementById('disp-sensor-sensitivity').innerText = this.state.sensorSensitivity;
        }
        
        this.updateImageDisplays(); this.applyColorsToDOM(); this.renderPalette();
    },

    saveBasicSettings() {
        const newName = document.getElementById('input-oshi-name').value.trim() || 'ME!';
        const newSensitivity = parseInt(document.getElementById('input-sensor-sensitivity').value) || 5;
        
        this.state.oshiName = newName; 
        this.state.sensorSensitivity = newSensitivity;
        
        localStorage.setItem('swm_oshi_name', newName); 
        localStorage.setItem('swm_sensitivity', newSensitivity);
        
        document.getElementById('oshi-name-display').innerText = newName;
        this.showToast(`기본 설정 저장 완료!`);
    },

    triggerCrop(event) {
        const file = event.target.files[0];
        this.state.cropTarget = document.getElementById('select-img-target').value;
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const cropImage = document.getElementById('crop-image');
                cropImage.src = e.target.result;
                document.getElementById('crop-modal').classList.add('active');
                if (this.state.cropperInstance) this.state.cropperInstance.destroy();
                this.state.cropperInstance = new Cropper(cropImage, { viewMode: 1, autoCropArea: 0.9, background: false, responsive: true });
                event.target.value = '';
            };
            reader.readAsDataURL(file);
        }
    },
    
    closeCropModal() {
        document.getElementById('crop-modal').classList.remove('active');
        if (this.state.cropperInstance) { this.state.cropperInstance.destroy(); this.state.cropperInstance = null; }
    },

    applyCrop() {
        if (!this.state.cropperInstance) return;
        const croppedCanvas = this.state.cropperInstance.getCroppedCanvas();
        if (!croppedCanvas) return;
        const MAX_WIDTH = 400; let finalCanvas = croppedCanvas;
        if (croppedCanvas.width > MAX_WIDTH) {
            const scaleSize = MAX_WIDTH / croppedCanvas.width;
            finalCanvas = document.createElement('canvas');
            finalCanvas.width = MAX_WIDTH; finalCanvas.height = croppedCanvas.height * scaleSize;
            const ctx = finalCanvas.getContext('2d');
            ctx.drawImage(croppedCanvas, 0, 0, finalCanvas.width, finalCanvas.height);
        }
        const dataUrl = finalCanvas.toDataURL('image/png');
        this.state.images[this.state.cropTarget] = dataUrl;
        localStorage.setItem('swm_images', JSON.stringify(this.state.images));
        this.updateImageDisplays(); this.showToast("이미지가 성공적으로 적용되었습니다! 📸"); this.closeCropModal();
    },
    
    updateImageDisplays() {
        const fallback = "image1.png";
        document.getElementById('img-main').src = this.state.images.main || fallback;
        document.getElementById('img-workout').src = this.state.images.workout || this.state.images.main || fallback;
        const finishImg = this.state.images.finish || this.state.images.main || fallback;
        if(document.getElementById('img-finish')) document.getElementById('img-finish').src = finishImg;
        if(document.getElementById('img-finish-screen')) document.getElementById('img-finish-screen').src = finishImg;
    },

    syncColorPicker() {
        const target = document.getElementById('select-color-target').value;
        const currentColor = this.state.colors[target] || '#ffffff';
        document.getElementById('color-picker').value = currentColor;
    },

    getContrast(hexColor) {
        if (!hexColor) return '#111111';
        let hex = hexColor.replace('#', '');
        if (hex.length === 3) hex = hex.split('').map(char => char + char).join('');
        const r = parseInt(hex.substr(0, 2), 16); const g = parseInt(hex.substr(2, 2), 16); const b = parseInt(hex.substr(4, 2), 16);
        const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        return (yiq >= 128) ? '#111111' : '#ffffff';
    },

    hexToRgb(hexColor) {
        if (!hexColor) return '59, 130, 246';
        let hex = hexColor.replace('#', '');
        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
        const r = parseInt(hex.substr(0, 2), 16); const g = parseInt(hex.substr(2, 2), 16); const b = parseInt(hex.substr(4, 2), 16);
        return `${isNaN(r) ? 59 : r}, ${isNaN(g) ? 130 : g}, ${isNaN(b) ? 246 : b}`;
    },

    mixColor(color1, color2, weight) {
        const h2d = (h) => parseInt(h, 16); const d2h = (d) => d.toString(16).padStart(2, '0');
        let c1 = color1.replace('#', ''); let c2 = color2.replace('#', '');
        if (c1.length === 3) c1 = c1.split('').map(x=>x+x).join(''); if (c2.length === 3) c2 = c2.split('').map(x=>x+x).join('');
        const r = Math.round(h2d(c1.substring(0,2)) * weight + h2d(c2.substring(0,2)) * (1 - weight));
        const g = Math.round(h2d(c1.substring(2,4)) * weight + h2d(c2.substring(2,4)) * (1 - weight));
        const b = Math.round(h2d(c1.substring(4,6)) * weight + h2d(c2.substring(4,6)) * (1 - weight));
        return `#${d2h(r)}${d2h(g)}${d2h(b)}`;
    },

    updateCalendarColors(baseColor) {
        const isLight = this.getContrast(baseColor) === '#111111';
        let lv1, lv2, lv3, lv4;
        const bg = this.state.colors.element || '#ffffff';
        if (isLight) {
            lv1 = this.mixColor(baseColor, bg, 0.4); lv2 = baseColor; lv3 = this.mixColor(baseColor, '#000000', 0.8); lv4 = this.mixColor(baseColor, '#000000', 0.6);
        } else {
            lv1 = this.mixColor(baseColor, bg, 0.3); lv2 = this.mixColor(baseColor, bg, 0.6); lv3 = baseColor; lv4 = this.mixColor(baseColor, '#000000', 0.8);
        }
        const root = document.documentElement;
        root.style.setProperty('--cal-lv1', lv1); root.style.setProperty('--cal-lv2', lv2); root.style.setProperty('--cal-lv3', lv3); root.style.setProperty('--cal-lv4', lv4);
        root.style.setProperty('--cal-lv1-text', this.getContrast(lv1)); root.style.setProperty('--cal-lv2-text', this.getContrast(lv2));
        root.style.setProperty('--cal-lv3-text', this.getContrast(lv3)); root.style.setProperty('--cal-lv4-text', this.getContrast(lv4));
    },

    applyColor(hexColor) {
        const newColor = hexColor || document.getElementById('color-picker').value;
        const target = document.getElementById('select-color-target').value;
        this.state.colors[target] = newColor;
        localStorage.setItem('swm_colors', JSON.stringify(this.state.colors));
        this.applyColorsToDOM();
        if (!this.state.palette.includes(newColor)) {
            this.state.palette.unshift(newColor);
            if(this.state.palette.length > 10) this.state.palette.pop();
            localStorage.setItem('swm_palette', JSON.stringify(this.state.palette));
            this.renderPalette();
        }
        this.syncColorPicker(); this.showToast("색상이 적용되었습니다! 🎨");
    },
    
    applyColorsToDOM() {
        const root = document.documentElement;
        root.style.setProperty('--bg-color', this.state.colors.bg); root.style.setProperty('--box-bg', this.state.colors.box);
        root.style.setProperty('--title-color', this.state.colors.title); root.style.setProperty('--btn-squat', this.state.colors.squat);
        root.style.setProperty('--btn-plank', this.state.colors.plank);
        root.style.setProperty('--bg-text', this.getContrast(this.state.colors.bg)); root.style.setProperty('--box-text', this.getContrast(this.state.colors.box));
        root.style.setProperty('--btn-squat-text', this.getContrast(this.state.colors.squat)); root.style.setProperty('--btn-plank-text', this.getContrast(this.state.colors.plank));
        const elementBg = this.state.colors.element || '#ffffff';
        root.style.setProperty('--element-bg', elementBg); root.style.setProperty('--element-text', this.getContrast(elementBg));
        if (this.state.colors.calendar) { this.updateCalendarColors(this.state.colors.calendar); } else { this.updateCalendarColors('#3b82f6'); }
    },
    
    renderPalette() {
        const container = document.getElementById('palette-container'); container.innerHTML = '';
        if(this.state.palette.length === 0) { container.innerHTML = '<span style="font-size:1rem; color:#888;">저장된 팔레트가 없습니다.</span>'; return; }
        this.state.palette.forEach((color, index) => {
            const wrapper = document.createElement('div'); wrapper.className = 'palette-item';
            const swatch = document.createElement('div'); swatch.className = 'color-swatch'; swatch.style.backgroundColor = color;
            swatch.onclick = () => { document.getElementById('color-picker').value = color; this.applyColor(color); };
            const delBtn = document.createElement('div'); delBtn.className = 'palette-del'; delBtn.innerText = '✕';
            delBtn.onclick = (e) => { e.stopPropagation(); this.removePaletteColor(index); };
            wrapper.appendChild(swatch); wrapper.appendChild(delBtn); container.appendChild(wrapper);
        });
    },
    
    removePaletteColor(index) {
        this.state.palette.splice(index, 1);
        localStorage.setItem('swm_palette', JSON.stringify(this.state.palette));
        this.renderPalette();
    },

    getRandomQuote(category) {
        const list = this.state.quotes[category];
        if(!list || list.length === 0) return "화이팅!";
        return list[Math.floor(Math.random() * list.length)];
    },
    
    addQuote() {
        const category = document.getElementById('select-quote-target').value;
        const newQuote = document.getElementById('input-quote').value.trim();
        if(newQuote) {
            this.state.quotes[category].push(newQuote);
            localStorage.setItem('swm_quotes', JSON.stringify(this.state.quotes));
            document.getElementById('input-quote').value = '';
            this.renderQuoteList(); this.showToast("대사가 추가되었습니다! 💬");
        }
    },
    
    renderQuoteList() {
        const category = document.getElementById('select-quote-target').value;
        const container = document.getElementById('quote-list-container'); container.innerHTML = '';
        const list = this.state.quotes[category];
        if(list.length === 0) { container.innerHTML = '<div style="font-size:1rem; color:#888;">저장된 대사가 없습니다.</div>'; return; }
        list.forEach((quote, index) => {
            const item = document.createElement('div'); item.className = 'quote-item';
            item.innerHTML = `<span>${quote}</span> <button class="quote-del" onclick="app.removeQuote('${category}', ${index})">삭제</button>`;
            container.appendChild(item);
        });
    },
    
    setMainQuote(text) { document.getElementById('main-speech').innerHTML = text; },
    setDefaultMainQuote() {
        const bubble = document.getElementById('main-speech');
        bubble.innerHTML = `운동 누적 횟수: <span id="streak-display">${this.state.streak}</span>일`;
    },
    changeMainQuote() {
        this.setMainQuote(this.getRandomQuote('main'));
        if (this.state.mainQuoteTimer) clearTimeout(this.state.mainQuoteTimer);
        this.state.mainQuoteTimer = setTimeout(() => { this.setDefaultMainQuote(); }, 3000);
    },
    setWorkoutQuote(text) {
        const bubble = document.getElementById('workout-speech');
        bubble.innerText = `"${text}"`;
    },

    adjustSetting(type, delta) {
        if (type === 'sets') {
            this.state.sets = Math.max(1, Math.min(10, this.state.sets + delta));
            document.getElementById('disp-sets').innerText = this.state.sets;
        } else if (type === 'reps') {
            if (this.state.mode === 'plank') {
                const step = 5;
                this.state.reps = Math.max(5, Math.min(300, this.state.reps + (delta > 0 ? step : -step)));
            } else {
                this.state.reps = Math.max(1, Math.min(100, this.state.reps + delta));
            }
            document.getElementById('disp-reps').innerText = this.state.reps;
        } else if (type === 'rest') {
            this.state.rest = Math.max(10, Math.min(180, this.state.rest + delta));
            document.getElementById('disp-rest').innerText = this.state.rest;
        }
    },

    showSettings(mode) {
        this.state.mode = mode;
        document.getElementById('setup-title').innerText = mode === 'squat' ? '스쿼트 설정' : '플랭크 설정';
        document.getElementById('label-reps').innerText = mode === 'squat' ? '1세트 당 횟수' : '1세트 시간(초)';
        
        const startBtn = document.getElementById('btn-start-workout');
        startBtn.classList.remove('btn-squat', 'btn-plank');
        startBtn.classList.add(`btn-${mode}`);

        if (mode === 'plank') { this.state.reps = 60; document.getElementById('disp-reps').innerText = 60; }
        else { this.state.reps = 10; document.getElementById('disp-reps').innerText = 10; }
        this.switchView('view-setup');
    },

    initWorkoutProcess() {
        this.state.isManualMode = false;
        
        if (this.state.mode === 'squat') {
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                DeviceMotionEvent.requestPermission().then(res => {
                    if (res === 'granted') {
                        this.showSquatGuide();
                    } else {
                        this.showToast("센서 권한이 거부되어 수동 모드로 진행합니다.");
                        this.startManualMode();
                    }
                }).catch(err => {
                    console.error("센서 권한 에러:", err);
                    this.showSquatGuide(); 
                });
            } else {
                this.showSquatGuide();
            }
        } else {
            this.startWorkout(); 
        }
    },

    // 💡 누락되었던 필수 초기화 함수 부활!
    resetHoldState() {
        this.state.holdState = { left: false, right: false };
        this.state.holdProgress = 0;
        if(this.state.holdTimer) clearInterval(this.state.holdTimer);
        this.state.holdTimer = null;
        this.updateGauge();
        
        const leftThumb = document.getElementById('thumb-left');
        const rightThumb = document.getElementById('thumb-right');
        if(leftThumb) leftThumb.classList.remove('active');
        if(rightThumb) rightThumb.classList.remove('active');
    },

    showSquatGuide() {
        this.resetHoldState();
        document.getElementById('squat-guide').classList.remove('hidden');
        
        this.state.calibValues = [];
        const self = this;
        this.state.tempMotionHandler = function(event) {
            const acc = event.accelerationIncludingGravity;
            if (acc) {
                const mag = Math.sqrt(Math.pow(acc.x, 2) + Math.pow(acc.y, 2) + Math.pow(acc.z, 2));
                self.state.calibValues.push(mag);
            }
        };
        window.addEventListener('devicemotion', this.state.tempMotionHandler);
    },

    cancelSquatGuide() {
        this.resetHoldState();
        document.getElementById('squat-guide').classList.add('hidden');
        if (this.state.tempMotionHandler) {
            window.removeEventListener('devicemotion', this.state.tempMotionHandler);
            this.state.tempMotionHandler = null;
        }
    },

    startManualMode() {
        this.resetHoldState();
        document.getElementById('squat-guide').classList.add('hidden');
        if (this.state.tempMotionHandler) {
            window.removeEventListener('devicemotion', this.state.tempMotionHandler);
            this.state.tempMotionHandler = null;
        }
        this.state.isManualMode = true;
        this.startWorkout();
    },

    startHold(side, event) {
        if (event && event.type === 'touchstart') {}
        
        this.state.holdState[side] = true;
        document.getElementById(`thumb-${side}`).classList.add('active');
        
        if (this.state.holdState.left && this.state.holdState.right && !this.state.holdTimer) {
            this.state.holdTimer = setInterval(() => {
                this.state.holdProgress += (100 / (2000 / 50)); 
                this.updateGauge();
                
                if (this.state.holdProgress >= 100) {
                    clearInterval(this.state.holdTimer);
                    this.state.holdProgress = 100;
                    this.updateGauge();
                    
                    if (this.state.calibValues.length > 0) {
                        const sum = this.state.calibValues.reduce((a, b) => a + b, 0);
                        this.state.baseG = sum / this.state.calibValues.length;
                    }
                    if (this.state.tempMotionHandler) {
                        window.removeEventListener('devicemotion', this.state.tempMotionHandler);
                        this.state.tempMotionHandler = null;
                    }
                    
                    setTimeout(() => {
                        document.getElementById('squat-guide').classList.add('hidden');
                        this.startWorkout();
                    }, 300);
                }
            }, 50);
        }
    },

    endHold(side) {
        this.state.holdState[side] = false;
        document.getElementById(`thumb-${side}`).classList.remove('active');
        
        if (this.state.holdTimer) {
            clearInterval(this.state.holdTimer);
            this.state.holdTimer = null;
            this.state.holdProgress = 0;
            this.updateGauge();
        }
    },

    updateGauge() {
        const maxOffset = 264;
        const currentOffset = maxOffset - (this.state.holdProgress / 100) * maxOffset;
        const leftCircle = document.querySelector('#thumb-left .progress-ring__circle');
        const rightCircle = document.querySelector('#thumb-right .progress-ring__circle');
        if(leftCircle) leftCircle.style.strokeDashoffset = currentOffset;
        if(rightCircle) rightCircle.style.strokeDashoffset = currentOffset;
    },

    startWorkout() {
        this.state.currentSet = 1; this.state.currentProgress = 0;
        this.state.workoutStartTime = Date.now();
        
        const isSquat = this.state.mode === 'squat';
        
        document.getElementById('workout-mode-title').innerText = isSquat 
            ? (this.state.isManualMode ? '스쿼트 진행 중 (수동)' : '스쿼트 진행 중') 
            : '플랭크 진행 중';
            
        document.getElementById('total-sets').innerText = this.state.sets;
        
        const btnPause = document.getElementById('btn-pause-workout');
        const btnManual = document.getElementById('btn-manual-complete');
        
        if (this.state.isManualMode) {
            document.getElementById('workout-count').innerText = this.state.reps;
            document.getElementById('workout-sub').innerText = isSquat ? " 회 (목표)" : " 초 (목표)";
            btnPause.classList.add('hidden');
            btnManual.classList.remove('hidden');
        } else {
            document.getElementById('workout-count').innerText = "0";
            document.getElementById('workout-sub').innerText = isSquat ? `/ ${this.state.reps} 회` : `/ ${this.state.reps} 초`;
            btnPause.classList.remove('hidden');
            btnManual.classList.add('hidden');
            btnPause.innerHTML = "일시정지 ⏸️";
        }
        
        this.updateWorkoutUI();
        this.switchView('view-workout');
        this.setWorkoutQuote(this.getRandomQuote('start'));

        if (!this.state.isManualMode) {
            if (isSquat) this.initSquatSensor();
            else this.initPlankTimer();
        }
    },

    confirmQuit() {
        this.state.wasWorkingOut = this.state.isWorkingOut;
        this.state.isWorkingOut = false; 
        this.openModal('quit-confirm-modal');
    },

    cancelQuit() {
        this.closeModal('quit-confirm-modal');
        if (this.state.wasWorkingOut) {
            this.state.isWorkingOut = true;
        }
    },

    quitWorkout() {
        this.state.isWorkingOut = false;
        this.state.wasWorkingOut = false; 
        clearInterval(this.state.timer);
        
        if (this.state.motionHandler) {
            window.removeEventListener('devicemotion', this.state.motionHandler);
            this.state.motionHandler = null;
        }

        this.closeModal('quit-confirm-modal');
        this.showToast("기록이 초기화되었습니다. 수고하셨어요! 😢");
        
        document.getElementById('workout-count').innerText = "0";
        this.setDefaultMainQuote();
        this.switchView('view-main');
    },
    
    returnToMain() {
        this.setDefaultMainQuote();
        this.switchView('view-main');
    },

    updateWorkoutUI() {
        if (!this.state.isManualMode) {
            document.getElementById('workout-count').innerText = this.state.currentProgress;
        }
        document.getElementById('current-set').innerText = this.state.currentSet;
    },

    initSquatSensor() {
        this.state.isWorkingOut = true;
        let isDown = false;
        
        document.getElementById('workout-count').onclick = () => { if(this.state.isWorkingOut) this.countUp(); };
        document.getElementById('img-workout').onclick = () => { if(this.state.isWorkingOut) this.countUp(); };

        if (this.state.motionHandler) {
            window.removeEventListener('devicemotion', this.state.motionHandler);
            this.state.motionHandler = null;
        }

        const baseG = this.state.baseG; 
        
        const minDelta = 0.5;
        const maxDelta = 4.0;
        const sensitivityVal = this.state.sensorSensitivity;
        
        const delta = minDelta + ((sensitivityVal - 1) / 9) * (maxDelta - minDelta);
        const downThreshold = baseG - delta; 
        const upThreshold = baseG + delta;   

        let lastCountTime = 0;
        const debounceMs = 800; 

        const self = this;
        this.state.motionHandler = function(event) {
            if (!self.state.isWorkingOut || self.state.isManualMode) return;
            
            const acc = event.accelerationIncludingGravity;
            if (!acc) return;

            const mag = Math.sqrt(Math.pow(acc.x, 2) + Math.pow(acc.y, 2) + Math.pow(acc.z, 2));
            
            if (mag < downThreshold) {
                isDown = true; 
            }
            if (isDown && mag > upThreshold) { 
                const now = Date.now();
                if (now - lastCountTime > debounceMs) {
                    isDown = false; 
                    lastCountTime = now;
                    self.countUp(); 
                }
            }
        };

        window.addEventListener('devicemotion', this.state.motionHandler); 
    },

    initPlankTimer() {
        this.state.isWorkingOut = true;
        this.state.timer = setInterval(() => { if(!this.state.isWorkingOut) return; this.countUp(); }, 1000);
    },

    countUp() {
        this.state.currentProgress++;
        this.updateWorkoutUI();
        if (navigator.vibrate) navigator.vibrate(50);
        
        if(this.state.currentProgress % 5 === 0 && this.state.currentProgress !== this.state.reps) {
            this.setWorkoutQuote(this.getRandomQuote('cheer'));
        }

        if (this.state.currentProgress >= this.state.reps) this.completeSet();
    },

    completeSet() {
        this.state.isWorkingOut = false;
        clearInterval(this.state.timer);
        
        if (this.state.motionHandler) {
            window.removeEventListener('devicemotion', this.state.motionHandler);
            this.state.motionHandler = null;
        }
        
        if (this.state.currentSet >= this.state.sets) {
            this.addWorkoutLog(this.state.mode, this.state.reps, this.state.sets);
            
            const today = new Date().toISOString().split('T')[0];
            if (this.state.lastDate !== today) {
                this.state.streak++; this.state.lastDate = today;
                localStorage.setItem('swm_streak', this.state.streak);
                localStorage.setItem('swm_last_date', today);
            }
            
            const elapsedSeconds = Math.floor((Date.now() - this.state.workoutStartTime) / 1000);
            const m = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
            const s = String(elapsedSeconds % 60).padStart(2, '0');
            
            const modeName = this.state.mode === 'squat' ? '스쿼트' : '플랭크';
            const unit = this.state.mode === 'squat' ? '회' : '초';
            
            document.getElementById('finish-title').innerText = `${modeName} 완료! 🎉`;
            document.getElementById('finish-desc').innerHTML = `
                총 ${this.state.reps * this.state.sets}${unit} / ${this.state.sets}세트<br>
                ⏳ 소요 시간: ${m}분 ${s}초<br><br>
                <span style="color: var(--title-color);">"${this.getRandomQuote('finish')}"</span>
            `;
            
            this.switchView('view-finish');
            
            if (this.state.googleUser && this.config.gasWebAppUrl) {
                this.backupToCloud(true); 
            }
            
        } else {
            this.startRest();
        }
    },

    startRest() {
        let timeLeft = this.state.rest;
        document.getElementById('rest-timer').innerText = timeLeft;
        this.switchView('view-rest');
        
        this.state.timer = setInterval(() => {
            timeLeft--;
            document.getElementById('rest-timer').innerText = timeLeft;
            if (timeLeft <= 0) this.skipRest();
        }, 1000);
    },

    skipRest() {
        clearInterval(this.state.timer);
        this.state.currentSet++; this.state.currentProgress = 0;
        
        if(this.state.isManualMode) {
            document.getElementById('workout-count').innerText = this.state.reps;
        }
        
        this.updateWorkoutUI();
        this.switchView('view-workout');
        this.state.isWorkingOut = true;
        
        if (!this.state.isManualMode) {
            if (this.state.mode === 'plank') this.initPlankTimer();
            else if (this.state.mode === 'squat') this.initSquatSensor(); 
        }
    },

    pauseWorkout() {
        this.state.isWorkingOut = !this.state.isWorkingOut;
        this.showToast(this.state.isWorkingOut ? "다시 가보자고! 🔥" : "잠시 멈춤 ⏸️");
        document.getElementById('btn-pause-workout').innerHTML = this.state.isWorkingOut ? "일시정지 ⏸️" : "계속하기 ▶️";
    },

    checkStreak() { document.getElementById('streak-display').innerText = this.state.streak; },

    addWorkoutLog(mode, reps, sets) {
        const today = new Date();
        const y = today.getFullYear();
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const d = String(today.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;
        
        let currentLog = this.state.workoutLogs[dateStr];
        
        if (typeof currentLog === 'number') {
            currentLog = { total: currentLog, details: [`과거 기록: 총 ${currentLog} 회/초`] };
        } else if (!currentLog) {
            currentLog = { total: 0, details: [] };
        }
        
        const modeName = mode === 'squat' ? '스쿼트' : '플랭크';
        const unit = mode === 'squat' ? '회' : '초';
        
        currentLog.total += (reps * sets);
        currentLog.details.push(`${modeName} / ${reps}${unit} / ${sets}세트`);
        
        this.state.workoutLogs[dateStr] = currentLog;
        localStorage.setItem('swm_logs', JSON.stringify(this.state.workoutLogs));
    },

    changeMonth(offset) {
        this.state.currentCalDate.setMonth(this.state.currentCalDate.getMonth() + offset);
        document.getElementById('cal-detail-box').classList.add('hidden');
        this.renderCalendar();
    },

    showDailyLog(dateStr) {
        const detailBox = document.getElementById('cal-detail-box');
        const dateTitle = document.getElementById('cal-detail-date');
        const list = document.getElementById('cal-detail-list');
        const log = this.state.workoutLogs[dateStr];
        
        dateTitle.innerText = dateStr.replace(/-/g, '. ');
        list.innerHTML = '';
        
        if (!log || (typeof log === 'number' && log === 0) || (log.details && log.details.length === 0)) {
            list.innerHTML = '<li style="color:#888;">이날은 운동 기록이 없어요 💦</li>';
        } else if (typeof log === 'number') {
            list.innerHTML = `<li>💪 과거 기록: 총 ${log} 회/초</li>`;
        } else {
            log.details.forEach(detail => { list.innerHTML += `<li>💪 ${detail}</li>`; });
        }
        detailBox.classList.remove('hidden');
    },

    renderCalendar() {
        const y = this.state.currentCalDate.getFullYear();
        const m = this.state.currentCalDate.getMonth();
        document.getElementById('cal-month-display').innerText = `${y}. ${String(m + 1).padStart(2, '0')}`;
        
        const grid = document.getElementById('calendar-grid');
        grid.innerHTML = `
            <div class="cal-day-name" style="color:#cf2b2b;">일</div>
            <div class="cal-day-name">월</div>
            <div class="cal-day-name">화</div>
            <div class="cal-day-name">수</div>
            <div class="cal-day-name">목</div>
            <div class="cal-day-name">금</div>
            <div class="cal-day-name" style="color:#61b8f2;">토</div>
        `;
        
        const firstDay = new Date(y, m, 1).getDay();
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        
        for (let i = 0; i < firstDay; i++) { grid.innerHTML += `<div class="day-cell empty"></div>`; }
        for (let d = 1; d <= daysInMonth; d++) {
            const dateKey = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const logData = this.state.workoutLogs[dateKey];
            const amount = logData ? (typeof logData === 'number' ? logData : logData.total) : 0;
            
            let levelClass = 'level-0';
            if (amount > 0 && amount <= 50) levelClass = 'level-1';
            else if (amount > 50 && amount <= 150) levelClass = 'level-2';
            else if (amount > 150 && amount <= 300) levelClass = 'level-3';
            else if (amount > 300) levelClass = 'level-4';
            
            grid.innerHTML += `<div class="day-cell ${levelClass}" onclick="app.showDailyLog('${dateKey}')">${d}</div>`;
        }
    }
};

window.onload = () => app.init();
