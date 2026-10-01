import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
function section(source, start, end) {
    const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
    assert(from >= 0 && to > from);
    return source.slice(from, to);
}
const home = read('js/modules/home.js');
function fixture({ role = 'store', networkField = 'networkId', batches = true, registered = true, visible = true } = {}) {
    const activity = { activityId: 'ACT_fixture', [networkField]: 'organizer-network', status: '上架' };
    const member = { userId: 'attendee', role, name: '原會員', phone: '0912345678', networkId: 'member-network', referrerId: 'original-referrer' };
    const calls = [], toasts = [];
    const context = {
        console, AbortController, setTimeout, clearTimeout,
        Config: { WORKER_URL: 'https://fixture.invalid' },
        document: { getElementById: () => null, createElement: () => { throw Error('must not open registration'); } },
        currentUserProfile: { userId: member.userId }, currentUser: { ...member }, userRole: role,
        currentNetworkId: 'organizer-network', currentPage: 'my-act-detail', allActivities: [activity],
        liff: { isLoggedIn: () => true, getAccessToken: () => 'verified-fixture-token' },
        applyUserPermissions() {}, addUserSocial() {},
        ActivityEntry: { getTarget: () => ({ networkId: visible ? 'organizer-network' : 'unrelated-network' }) },
        ActivityBatches: { selection: () => batches ? ['ACT_fixture_B01', 'ACT_fixture_B02'] : undefined },
        getInitialActivityNetwork_: () => '',
        goActivityRecordAfterJoin_: async () => {},
        showToast: (message, error) => toasts.push({ message, error }),
        fetch: async (_url, options) => {
            const request = JSON.parse(options.body);
            calls.push(request);
            if (request.action === 'checkUser') return { ok: true, json: async () => registered
                ? { success: true, data: { isRegistered: true, info: member } }
                : { success: false, error: '無法確認會員' } };
            assert.equal(request.action, 'joinActivity');
            return { ok: true, json: async () => ({ success: true, data: { activityId: activity.activityId } }) };
        }
    };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(section(read('js/auth.js'), 'window.applyRegisteredUserSession =', 'window.setPointWalletStatus ='), context);
    vm.runInContext(section(read('js/core.js'), '    window.fetchAPI =', '    // 強效配對機制'), context);
    vm.runInContext(read('js/modules/activity-registration.js'), context);
    vm.runInContext(section(home, '    function getPublicActivityId_', '    window.homeActivityFilter'), context);
    vm.runInContext(section(home, '    let activityJoinBusy = false;', '    // === 模組初始化入口'), context);
    return { context, calls, member, activity, toasts, button: { innerHTML: '我要報名', disabled: false } };
}

for (const role of ['store', 'tenant', 'user', 'admin']) {
    test(`${role}: actual session refresh and API keep activity scope for single and multi-date signup`, async () => {
        for (const networkField of ['networkId', 'network_id', '歸屬網']) {
            for (const batches of [false, true]) {
                const f = fixture({ role, networkField, batches });
                await f.context.joinPublicActivity(f.activity.activityId, f.button);
                assert.deepEqual(f.calls.map(c => c.action), ['checkUser', 'joinActivity']);
                const sent = f.calls[1].payload;
                assert.equal(sent.networkId, 'organizer-network');
                assert.equal(sent.userId, f.member.userId);
                assert.equal(sent.lineAccessToken, 'verified-fixture-token');
                assert.equal(sent.userPhone, f.member.phone);
                assert.deepEqual(sent.batchIds, batches ? ['ACT_fixture_B01', 'ACT_fixture_B02'] : undefined);
                assert.equal(f.context.currentUser.networkId, f.member.networkId);
                assert.equal(f.context.currentUser.referrerId, f.member.referrerId);
                assert.equal(f.context.currentNetworkId, role === 'admin' ? 'admin' : ['store', 'tenant'].includes(role) ? 'attendee' : 'member-network');
                assert.equal(f.button.disabled, false);
                assert.equal(f.toasts.at(-1).message, '報名成功');
            }
        }
    });
}

test('invisible activity or failed member confirmation never sends signup', async () => {
    for (const options of [{ visible: false }, { registered: false }]) {
        const f = fixture(options);
        await f.context.joinPublicActivity(f.activity.activityId, f.button);
        assert(!f.calls.some(c => c.action === 'joinActivity'));
        assert.equal(f.button.disabled, false);
        assert.equal(f.toasts.at(-1).error, true);
    }
});
