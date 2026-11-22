// RACE Insight cloud sync API for the website (a public URL, not a secret).
// HTTP API from the RaceInsightSyncApi stack (eu-central-1). Its CORS rule
// allows only the live site's origin, so calls from other hosts (localhost,
// preview builds) are refused by the browser. Set to '' to switch Cloud files
// to "not available yet".
window.RACE_INSIGHT_SYNC = {
    apiUrl: 'https://hwxohz3qtd.execute-api.eu-central-1.amazonaws.com'
};
