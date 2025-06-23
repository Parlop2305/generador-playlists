// main.js

const SPOTIFY_CLIENT_ID = '5e1d32a3e54b4fb1ba42be6b643162ea';
const SPOTIFY_REDIRECT_URI = 'https://parlop2305.github.io/generador-playlists/';
const SPOTIFY_SCOPES = [
  'playlist-modify-public',
  'playlist-modify-private',
  'user-read-private'
];

function generateCodeVerifier(length = 128) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let verifier = '';
  for (let i = 0; i < length; i++) {
    verifier += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return verifier;
}

async function generateCodeChallenge(codeVerifier) {
  const data = new TextEncoder().encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

document.getElementById("spotifyPKCEBtn").onclick = async () => {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  localStorage.setItem("spotify_code_verifier", codeVerifier);

  const authURL =
    'https://accounts.spotify.com/authorize' +
    '?response_type=code' +
    '&client_id=' + SPOTIFY_CLIENT_ID +
    '&redirect_uri=' + encodeURIComponent(SPOTIFY_REDIRECT_URI) +
    '&scope=' + encodeURIComponent(SPOTIFY_SCOPES.join(' ')) +
    '&code_challenge_method=S256' +
    '&code_challenge=' + codeChallenge;

  window.location.href = authURL;
};

// INTERCAMBIO DE CÓDIGO POR TOKEN
window.addEventListener('load', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');

  if (code) {
    const verifier = localStorage.getItem("spotify_code_verifier");

    const body = new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: SPOTIFY_REDIRECT_URI,
      code_verifier: verifier
    });

    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    const data = await res.json();
    console.log("🎧 Token de Spotify:", data);

    if (data.access_token) {
      localStorage.setItem("spotifyToken", data.access_token);
      window.history.replaceState({}, document.title, window.location.pathname);
      document.getElementById("generateSpotifyBtn").disabled = false;
      document.getElementById("validateSpotifyBtn").disabled = false;
    }
  }
});
