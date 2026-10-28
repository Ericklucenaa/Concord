import { useCallback } from 'react';
import {
  User, MessageSquare, UserPlus, UserMinus, UserCheck, Clock, VolumeX, Volume2, Ban, ShieldOff, Copy,
  PhoneOff, MicOff, Mic, Shield, UserX, Crown, Pencil, Settings, Headphones
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useServer } from '../context/ServerContext';
import { useDM } from '../context/DMContext';
import { useVoice } from '../context/VoiceContext';
import { useNotification } from '../context/NotificationContext';
import { useOverlayUI } from '../context/OverlayUIContext';
import { isAdmin, isModerator, outranks, roleOf } from '../services/permissions';

const copy = (text) => navigator.clipboard.writeText(String(text)).catch(() => {});

/**
 * One right-click menu for a person, used everywhere a user appears (member
 * list, voice channel, call tiles, messages, DMs, friends). Moderation items
 * only appear when the rules would allow them; Firestore enforces them anyway.
 *
 *   const openUserMenu = useUserMenu();
 *   <div onContextMenu={(e) => openUserMenu(e, { id, username, avatar })}>
 */
export function useUserMenu() {
  const { user } = useAuth();
  const { activeServer, setActiveServer, setMemberRole, kickMember, banMember, setMemberMuted, transferOwnership, openModal } = useServer();
  const {
    openDMWithUser, friendList, incomingRequests, outgoingRequests, sendFriendRequest, respondFriendRequest, removeFriend,
    isBlocked, blockUser, unblockUser
  } = useDM();
  const { activeVoiceChannel, voiceUsers, voiceServer, userVolumes, setUserVolume, kickUserFromVoice, voiceChannelUsersMap } = useVoice();
  const { showConfirm, showError, showSuccess, showToast } = useNotification();
  const { openMenu, openProfile } = useOverlayUI();

  return useCallback((event, target, options = {}) => {
    if (!target?.id || !user) return;
    const me = user.id;
    const isMe = target.id === me;
    const name = target.username || 'usuário';
    const { clientX: x, clientY: y } = event;
    const anchor = { currentTarget: { getBoundingClientRect: () => ({ left: x, right: x, top: y, bottom: y }) } };

    const run = async (fn, success) => {
      try {
        await fn();
        if (success) showSuccess('Pronto', success);
      } catch (err) {
        showError('Ação não permitida', String(err?.message || '').includes('permission') ? 'Você não tem permissão para isso.' : err?.message);
      }
    };

    if (isMe) {
      openMenu(event, [
        { label: 'Ver perfil', icon: User, onClick: () => openProfile(me, anchor) },
        { label: 'Editar perfil', icon: Pencil, onClick: () => openModal('settings', 'account') },
        { label: 'Configurações de voz', icon: Headphones, onClick: () => openModal('settings', 'audio') },
        { label: 'Configurações', icon: Settings, onClick: () => openModal('settings') },
        { separator: true },
        { label: 'Copiar ID', icon: Copy, onClick: () => copy(me) }
      ], `@${name}`);
      return;
    }

    // Friendship state.
    const friend = friendList.find((f) => f.id === target.id);
    const incoming = incomingRequests.find((f) => f.id === target.id);
    const outgoing = outgoingRequests.find((f) => f.id === target.id);
    const blocked = isBlocked(target.id);

    // Same call as me: local volume / local mute.
    const inMyCall = Boolean(activeVoiceChannel && voiceUsers.some((u) => u.userId === target.id));
    const volume = userVolumes.get(target.id) ?? 1;

    // Moderation happens in the server the person is shown in: the call's
    // server, or the server being browsed.
    const server = options.server
      || (inMyCall && voiceServer)
      || (activeServer?.memberIds?.includes(target.id) ? activeServer : null);
    const canMod = Boolean(server && isModerator(server, me) && outranks(server, me, target.id));
    const canAdmin = Boolean(server && isAdmin(server, me) && outranks(server, me, target.id));
    const isOwner = server?.ownerId === me;
    const targetRole = server ? roleOf(server, target.id) : null;
    const serverMuted = Boolean(server?.mutedIds?.includes(target.id));
    const targetInServerVoice = Boolean(server && [...(voiceChannelUsersMap?.values?.() || [])].flat().some((u) => u.userId === target.id))
      || (inMyCall && voiceServer?.id === server?.id);
    const member = { id: target.id, username: name, avatar: target.avatar || '' };

    openMenu(event, [
      { label: 'Ver perfil', icon: User, onClick: () => openProfile(target.id, anchor) },
      !blocked && {
        label: 'Enviar mensagem',
        icon: MessageSquare,
        onClick: () => run(async () => {
          setActiveServer(null);
          await openDMWithUser(member);
        })
      },
      friend
        ? {
            label: 'Remover amizade',
            icon: UserMinus,
            onClick: async () => {
              if (await showConfirm('Remover amizade', `Remover @${name} dos seus amigos?`, { isDanger: true, confirmText: 'Remover' })) {
                run(() => removeFriend(friend.friendshipId), `@${name} não é mais seu amigo.`);
              }
            }
          }
        : incoming
          ? { label: 'Aceitar pedido de amizade', icon: UserCheck, onClick: () => run(() => respondFriendRequest(incoming, 'accept'), `Agora você e @${name} são amigos.`) }
          : outgoing
            ? { label: 'Pedido de amizade enviado', icon: Clock, disabled: true }
            : !blocked && { label: 'Adicionar amigo', icon: UserPlus, onClick: () => run(() => sendFriendRequest(name), `Pedido enviado para @${name}.`) },

      inMyCall && { separator: true },
      inMyCall && {
        slider: {
          label: 'Volume',
          value: Math.round(volume * 100),
          min: 0,
          max: 200,
          step: 5,
          format: (v) => `${v}%`,
          onChange: (v) => setUserVolume(target.id, v / 100)
        }
      },
      inMyCall && {
        label: volume === 0 ? 'Ativar áudio desta pessoa' : 'Silenciar para mim',
        icon: volume === 0 ? Volume2 : VolumeX,
        checked: volume === 0,
        onClick: () => {
          setUserVolume(target.id, volume === 0 ? 1 : 0);
          showToast(volume === 0 ? `Você voltou a ouvir @${name}.` : `@${name} foi silenciado só para você.`, 'info');
        }
      },

      canMod && { heading: `Moderação · ${server.name}` },
      canMod && targetInServerVoice && {
        label: 'Desconectar da chamada',
        icon: PhoneOff,
        onClick: () => kickUserFromVoice(null, target.id)
      },
      canMod && {
        label: serverMuted ? 'Remover silêncio no servidor' : 'Silenciar no servidor',
        icon: serverMuted ? Mic : MicOff,
        onClick: () => run(() => setMemberMuted(server.id, member, !serverMuted))
      },
      canAdmin && isOwner && targetRole !== 'admin' && { label: 'Tornar admin', icon: Shield, onClick: () => run(() => setMemberRole(server.id, member, 'admin'), `@${name} agora é admin.`) },
      canAdmin && targetRole !== 'moderator' && { label: 'Tornar moderador', icon: Shield, onClick: () => run(() => setMemberRole(server.id, member, 'moderator'), `@${name} agora é moderador.`) },
      canAdmin && targetRole !== 'member' && { label: 'Tornar membro', icon: UserCheck, onClick: () => run(() => setMemberRole(server.id, member, 'member')) },
      canAdmin && isOwner && {
        label: 'Transferir propriedade',
        icon: Crown,
        onClick: async () => {
          if (await showConfirm('Transferir propriedade', `Tornar @${name} o novo dono de "${server.name}"? Você passará a ser admin.`, { isDanger: true, confirmText: 'Transferir' })) {
            run(() => transferOwnership(server.id, member), `@${name} agora é o dono do servidor.`);
          }
        }
      },
      canAdmin && {
        label: 'Expulsar do servidor',
        icon: UserX,
        danger: true,
        onClick: async () => {
          if (await showConfirm('Expulsar membro', `Remover @${name} de "${server.name}"? A pessoa pode voltar com um novo convite.`, { isDanger: true, confirmText: 'Expulsar' })) {
            run(() => kickMember(server.id, member), `@${name} foi expulso.`);
          }
        }
      },
      canAdmin && {
        label: 'Banir do servidor',
        icon: Ban,
        danger: true,
        onClick: async () => {
          if (await showConfirm('Banir membro', `Banir @${name} de "${server.name}"? A pessoa não poderá voltar nem com convites.`, { isDanger: true, confirmText: 'Banir' })) {
            run(() => banMember(server.id, member), `@${name} foi banido.`);
          }
        }
      },

      { separator: true },
      {
        label: blocked ? 'Desbloquear' : 'Bloquear',
        icon: blocked ? ShieldOff : Ban,
        danger: !blocked,
        onClick: async () => {
          if (blocked) return run(() => unblockUser(target.id), `@${name} foi desbloqueado.`);
          if (await showConfirm('Bloquear', `Bloquear @${name}? Vocês não poderão trocar mensagens diretas e as mensagens dessa pessoa ficarão ocultas.`, { isDanger: true, confirmText: 'Bloquear' })) {
            run(() => blockUser(target.id), `@${name} foi bloqueado.`);
          }
          return undefined;
        }
      },
      { label: 'Copiar ID', icon: Copy, onClick: () => copy(target.id) }
    ], `@${name}`);
  }, [user, activeServer, setActiveServer, setMemberRole, kickMember, banMember, setMemberMuted, transferOwnership, openModal,
    openDMWithUser, friendList, incomingRequests, outgoingRequests, sendFriendRequest, respondFriendRequest, removeFriend, isBlocked, blockUser, unblockUser,
    activeVoiceChannel, voiceUsers, voiceServer, userVolumes, setUserVolume, kickUserFromVoice, voiceChannelUsersMap,
    showConfirm, showError, showSuccess, showToast, openMenu, openProfile]);
}
