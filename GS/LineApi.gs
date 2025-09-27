// LineApi.gs

function exchangeCodeForToken_(code) {
  const url     = 'https://api.line.me/oauth2/v2.1/token';
  const payload = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: LINE_REDIRECT_URL,
    client_id: LINE_CHANNEL_ID,
    client_secret: LINE_CHANNEL_SECRET
  };
  const resp = UrlFetchApp.fetch(url, {
    method: 'post',
    payload: Object.keys(payload).map(k => `${k}=${encodeURIComponent(payload[k])}`).join('&'),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    muteHttpExceptions: true
  });
  const json = JSON.parse(resp.getContentText());
  if (!json.access_token) throw new Error('交換 access_token 失敗：' + resp.getContentText());
  return json;
}

function getLineProfile_(accessToken) {
  const resp = UrlFetchApp.fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: 'Bearer ' + accessToken },
    muteHttpExceptions: true
  });
  return JSON.parse(resp.getContentText());
}

function parseIdToken_(idToken) {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error("Invalid id_token format");

  // 轉換 base64url → base64
  let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }

  const decoded = Utilities.base64Decode(base64);
  return JSON.parse(Utilities.newBlob(decoded).getDataAsString());
}

function getLineUserInfo_(tokenJson) {
  const profile = getLineProfile_(tokenJson.access_token);
  const payload = parseIdToken_(tokenJson.id_token);
  return {
    userId: profile.userId,
    displayName: profile.displayName,
    pictureUrl: profile.pictureUrl,
    email: payload.email || ""
  };
}
