function getApiBase() {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  if (typeof window !== 'undefined') {
    const { hostname } = window.location;
    // When running locally on dev server or localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1' || !hostname) {
      return 'http://localhost:4000';
    }
    // Hosted static web (Firebase Hosting, Vercel, etc.) without an explicit backend API:
    // Mark as null so the app uses Firestore CloudSync & Firebase Auth directly without 404s.
    return null;
  }
  return 'http://localhost:4000';
}

const API_BASE = getApiBase();
const API_URL = API_BASE ? (API_BASE.endsWith('/api') ? API_BASE : `${API_BASE}/api`) : null;

class ApiService {
  getToken() {
    const token = localStorage.getItem('concord_token');
    return token && token !== 'undefined' && token !== 'null' ? token : null;
  }

  setToken(token) {
    if (token && token !== 'undefined' && token !== 'null') {
      localStorage.setItem('concord_token', token);
    } else {
      localStorage.removeItem('concord_token');
    }
  }

  hasBackend() {
    return Boolean(API_URL);
  }

  async request(endpoint, options = {}) {
    if (!API_URL) {
      throw new Error('Backend indisponível (modo offline).');
    }

    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    };

    const config = {
      ...options,
      headers
    };

    try {
      const response = await fetch(`${API_URL}${endpoint}`, config);
      const contentType = response.headers.get('content-type') || '';

      let data;
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        if (!response.ok) {
          throw new Error(text || `Erro no servidor (${response.status} ${response.statusText}).`);
        }
        throw new Error('Backend indisponível (modo offline).');
      }

      if (!response.ok) {
        throw new Error(data.error || 'Ocorreu um erro na requisição.');
      }

      return data;
    } catch (error) {
      throw error;
    }
  }

  // Auth
  register(userData) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
  }

  login(credentials) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    });
  }

  loginWithGoogle(googleData) {
    return this.request('/auth/google', {
      method: 'POST',
      body: JSON.stringify(googleData)
    });
  }

  getMe() {
    return this.request('/auth/me');
  }

  updateProfile(profileData) {
    return this.request('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(profileData)
    });
  }

  // Servers
  getServers() {
    return this.request('/servers');
  }

  getServer(serverId) {
    return this.request(`/servers/${serverId}`);
  }

  createServer(serverData) {
    return this.request('/servers', {
      method: 'POST',
      body: JSON.stringify(serverData)
    });
  }

  updateServer(serverId, serverData) {
    return this.request(`/servers/${serverId}`, {
      method: 'PUT',
      body: JSON.stringify(serverData)
    });
  }

  deleteServer(serverId) {
    return this.request(`/servers/${serverId}`, {
      method: 'DELETE'
    });
  }

  leaveServer(serverId) {
    return this.request(`/servers/${serverId}/leave`, {
      method: 'POST'
    });
  }

  // Channels
  createChannel(serverId, channelData) {
    return this.request(`/channels/server/${serverId}`, {
      method: 'POST',
      body: JSON.stringify(channelData)
    });
  }

  updateChannel(channelId, channelData) {
    return this.request(`/channels/${channelId}`, {
      method: 'PUT',
      body: JSON.stringify(channelData)
    });
  }

  deleteChannel(channelId) {
    return this.request(`/channels/${channelId}`, {
      method: 'DELETE'
    });
  }

  // Messages
  getMessages(channelId, params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/messages/channel/${channelId}${query ? `?${query}` : ''}`);
  }

  deleteMessage(messageId) {
    return this.request(`/messages/${messageId}`, {
      method: 'DELETE'
    });
  }

  // Invites
  createInvite(serverId, inviteData) {
    return this.request(`/invites/server/${serverId}`, {
      method: 'POST',
      body: JSON.stringify(inviteData)
    });
  }

  joinByCode(code) {
    return this.request('/invites/join', {
      method: 'POST',
      body: JSON.stringify({ code })
    });
  }

  getPendingInvites() {
    return this.request('/invites/pending');
  }

  respondInvite(inviteId, action) {
    return this.request(`/invites/${inviteId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ action })
    });
  }

  // Members & Roles
  updateMemberRole(serverId, memberId, role) {
    return this.request(`/members/server/${serverId}/member/${memberId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role })
    });
  }

  muteMember(serverId, memberId, muted) {
    return this.request(`/members/server/${serverId}/member/${memberId}/mute`, {
      method: 'PUT',
      body: JSON.stringify({ muted })
    });
  }

  kickMember(serverId, memberId) {
    return this.request(`/members/server/${serverId}/member/${memberId}`, {
      method: 'DELETE'
    });
  }

  // Config
  getWebRTCConfig() {
    return this.request('/config/webrtc');
  }
}

export const api = new ApiService();
