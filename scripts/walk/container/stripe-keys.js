const kind = (v) => {
    if (!v) { return 'absent'; }
    if (/^(sk|rk|pk)_test_/.test(v)) { return 'test'; }
    if (/^(sk|rk|pk)_live_/.test(v)) { return 'live'; }
    return 'unknown';
};
const out = { secret: kind(process.env.STRIPE_SECRET_KEY), publishable: kind(process.env.STRIPE_PUBLISHABLE_KEY) };
if (input.balance && out.secret === 'test') {
    const r = await fetch('https://api.stripe.com/v1/balance', {
        headers: { authorization: `Basic ${Buffer.from(`${process.env.STRIPE_SECRET_KEY}:`).toString('base64')}` },
        signal: AbortSignal.timeout(30000),
    }).catch(() => null);
    out.balanceStatus = r ? r.status : null;
}
return out;
