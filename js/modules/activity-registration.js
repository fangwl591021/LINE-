// Only a deliberate activity signup can open this form. Reuse member APIs and session handling.
(function () {
    const text = value => String(value || '').trim();
    const phone = value => text(value).replace(/[\s()（）-]/g, '');
    const validMember = result => result && !result.error && result.success !== false &&
        result.isRegistered === true && result.info && typeof result.info === 'object' && !Array.isArray(result.info) &&
        text(result.info.userId || result.info.lineId);
    function accept(result) {
        if (!validMember(result)) throw new Error('會員資料尚未確認，請重試；不會先送出活動報名');
        window.applyRegisteredUserSession({ ...result.info, isRegistered: true }, { skipHome: true });
    }
    async function ensureMember(activity) {
        const userId = text(window.currentUserProfile?.userId);
        const token = window.liff?.getAccessToken?.();
        const page = window.currentPage;
        if (!userId || !token || !window.liff?.isLoggedIn?.()) throw new Error('請重新從 LINE 開啟活動並登入');
        const current = () => window.currentUserProfile?.userId === userId && window.liff?.getAccessToken?.() === token && window.currentPage === page;
        const check = await window.fetchAPI('checkUser', { userId }, true);
        if (!current()) return false;
        if (validMember(check)) { accept(check); return true; }
        if (!check || check.error || check.success === false || check.isRegistered !== false || check.info != null) {
            throw new Error('無法確認會員資料，請稍後重試');
        }
        return new Promise(resolve => {
            let saving = false;
            const modal = document.createElement('div');
            modal.id = 'activity-registration-modal';
            modal.className = 'fixed inset-0 z-[2300] bg-slate-900/60 flex items-center justify-center p-3';
            modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'activity-registration-title');
            modal.innerHTML = `<form class="bg-white rounded-2xl w-full max-w-md flex flex-col overflow-hidden" style="max-height:90dvh">
                <div class="flex items-center justify-between p-4 border-b"><h2 id="activity-registration-title" class="text-xl font-black">首次報名資料</h2><button type="button" data-cancel class="p-2" aria-label="關閉報名資料">✕</button></div>
                <div class="p-4 space-y-4 overflow-y-auto">
                    <p class="text-sm text-slate-600">填寫一次即可建立 AI商脈會員，並接續報名本活動。</p>
                    <label class="block font-bold">姓名<input id="activity-reg-name" class="custom-input mt-1" autocomplete="name" maxlength="100" required></label>
                    <label class="block font-bold">手機號碼<input id="activity-reg-phone" class="custom-input mt-1" type="tel" inputmode="tel" autocomplete="tel" maxlength="24" placeholder="09xxxxxxxx" required></label>
                    <label class="flex items-start gap-2 text-sm leading-6"><input id="activity-reg-agree" type="checkbox" class="mt-1 h-5 w-5 shrink-0"><span>我同意註冊為 AI商脈會員，並已閱讀及同意 <button type="button" data-privacy class="text-blue-600 underline">個資聲明</button>。</span></label>
                    <p data-error role="status" aria-live="polite" class="text-sm text-red-600"></p>
                </div>
                <div class="grid grid-cols-2 gap-2 p-4 border-t"><button type="button" data-cancel class="p-3 bg-slate-100 rounded-xl font-bold">取消</button><button type="submit" class="p-3 bg-emerald-600 text-white rounded-xl font-bold whitespace-nowrap">註冊並報名</button></div>
            </form>`;
            document.body.appendChild(modal);
            const nameInput = modal.querySelector('#activity-reg-name'), phoneInput = modal.querySelector('#activity-reg-phone');
            nameInput.value = text(window.currentUserProfile?.displayName);
            const close = result => { modal.remove(); resolve(result); };
            modal.querySelectorAll('[data-cancel]').forEach(button => button.onclick = () => { if (!saving) close(false); });
            modal.querySelector('[data-privacy]').onclick = () => window.openPrivacyTermsModal();
            modal.onkeydown = event => { if (event.key === 'Escape' && !saving) close(false); };
            modal.querySelector('form').onsubmit = async event => {
                event.preventDefault();
                if (saving) return;
                if (!current()) { close(false); return; }
                const error = modal.querySelector('[data-error'); error.textContent = '';
                const name = text(nameInput.value), mobile = phone(phoneInput.value);
                if (!name || !/^\+?\d{8,15}$/.test(mobile)) { error.textContent = '請填寫姓名及有效手機號碼'; return; }
                if (!window.requirePrivacyTermsAgreement('activity-reg-agree')) return;
                saving = true;
                const submit = modal.querySelector('[type=submit]'); submit.disabled = true; submit.textContent = '確認資料中…';
                try {
                    // Recheck on retry or if another tab registered meanwhile. Never overwrite that member.
                    const latest = await window.fetchAPI('checkUser', { userId }, true);
                    if (!current()) { close(false); return; }
                    if (validMember(latest)) { accept(latest); close(true); return; }
                    if (!latest || latest.error || latest.success === false || latest.isRegistered !== false || latest.info != null) throw new Error('無法確認會員資料，請重試');
                    const route = window.ActivityEntry?.getFriendshipReturnUrl?.();
                    const params = route ? new URL(route).searchParams : window.readActmasterInitialParams();
                    const attribution = window.resolveReferralForRegistration(params.get('ref') || params.get('r') || '', params.get('net') || params.get('n') || window.currentNetworkId || 'admin');
                    const saved = await window.fetchAPI('registerUser', {
                        userId, name, phone: mobile, ...attribution,
                        activityRegistration: true, privacyAgreed: true,
                        activityId: text(activity.activityId || activity.activity_id || activity['活動ID']),
                        activityNetworkId: text(activity.networkId || activity.network_id || activity['歸屬網']) || 'admin'
                    }, true);
                    if (!current()) { close(false); return; }
                    if (!validMember(saved)) throw new Error(saved?.error || '註冊結果尚未確認，請按確認重試；不會先送出報名');
                    accept(saved); close(true);
                } catch (e) { error.textContent = e.message || '註冊失敗，請重試'; }
                finally { saving = false; submit.disabled = false; submit.textContent = '註冊並報名'; }
            };
            nameInput.focus();
        });
    }
    window.ActivityRegistration = { ensureMember };
})();
