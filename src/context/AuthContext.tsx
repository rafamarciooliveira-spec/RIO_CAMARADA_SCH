import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import {
  User,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  sendPasswordResetEmail,
  sendEmailVerification,
} from 'firebase/auth';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase/config.ts';
import { Member, ViewRole, UserNotification, CardTemplate, AdminUser, MemberCategory, MemberStatus, ThemeMode } from '../types/index.ts';
import { triggerPushNotification } from '../utils/pushNotification.ts';
import { DEFAULT_TEMPLATES } from '../data/defaultTemplates.ts';
import { clearOfflineSavedCard, DEFAULT_OFFICIAL_EXPIRY } from '../utils/security.ts';

const BOOTSTRAP_ADMIN_EMAIL = 'rafa.marciooliveira@gmail.com';

export type PortalTab =
  | 'card'
  | 'events'
  | 'news'
  | 'birthdays'
  | 'culture'
  | 'financial'
  | 'socials'
  | 'mydata'
  | 'privacy';

export type BoardRole = 'superadmin' | 'diretoria_executiva' | 'diretoria' | 'tesoureiro' | 'conselho_fiscal' | null;

interface AuthContextType {
  currentUser: User | null;
  currentMember: Member | null;
  memberLoading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isDiretoriaExecutiva: boolean;
  isDiretoria: boolean;
  isBoardMember: boolean;
  isTesoureiro: boolean;
  isConselhoFiscal: boolean;
  canManageFinances: boolean;
  canViewFinances: boolean;
  boardRole: BoardRole;
  adminList: AdminUser[];
  theme: ThemeMode;
  toggleTheme: () => void;
  addAdmin: (
    email: string,
    name?: string,
    role?: 'diretoria_executiva' | 'diretoria' | 'admin' | 'tesoureiro' | 'conselho_fiscal',
    category?: 'DIRETORIA EXECUTIVA' | 'DIRETORIA' | 'TESOUREIRO' | 'CONSELHO FISCAL'
  ) => Promise<void>;
  removeAdmin: (adminId: string) => Promise<void>;
  activeRole: ViewRole;
  setActiveRole: (role: ViewRole) => void;
  activePortalTab: PortalTab;
  setActivePortalTab: (tab: PortalTab) => void;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  reloadUser: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  syncPublicCard: (member: Partial<Member> & { id: string }) => Promise<void>;
  mustChangePassword: boolean;
  changeInitialPassword: (newPass: string) => Promise<void>;
  updateUserCategory: (memberId: string, category: MemberCategory) => Promise<void>;
  updateUserStatus: (memberId: string, status: MemberStatus) => Promise<void>;
  updateUserForcePassword: (memberId: string, force: boolean) => Promise<void>;
  notifications: UserNotification[];
  markNotificationRead: (id: string) => Promise<void>;
  activeTemplate: CardTemplate;
  setActiveTemplate: (tmpl: CardTemplate) => void;
  saveActiveTemplate: (tmpl: CardTemplate) => Promise<void>;
  templates: CardTemplate[];
  refreshTemplates: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentMember, setCurrentMember] = useState<Member | null>(null);
  const [memberLoading, setMemberLoading] = useState<boolean>(true);
  const [adminList, setAdminList] = useState<AdminUser[]>([]);
  const [activePortalTab, setActivePortalTab] = useState<PortalTab>('card');
  const [activeRole, setActiveRoleState] = useState<ViewRole>(() => {
    try {
      const saved = localStorage.getItem('associacao_active_role');
      if (saved === 'admin' || saved === 'member') return saved as ViewRole;
    } catch (e) {}
    return 'member';
  });
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [templates, setTemplates] = useState<CardTemplate[]>(DEFAULT_TEMPLATES);
  const [activeTemplate, setActiveTemplate] = useState<CardTemplate>(() => {
    try {
      const cached = localStorage.getItem('associacao_active_template_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.name && parsed.primaryColor) {
          return parsed;
        }
      }
    } catch (e) {}
    return DEFAULT_TEMPLATES[0];
  });
  const [previousStatus, setPreviousStatus] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('associacao_theme');
      if (saved === 'light' || saved === 'dark') return saved as ThemeMode;
    } catch (e) {}
    return 'dark';
  });

  useEffect(() => {
    try {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      }
      localStorage.setItem('associacao_theme', theme);
    } catch (e) {}
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const setActiveRole = (role: ViewRole) => {
    setActiveRoleState(role);
    try {
      localStorage.setItem('associacao_active_role', role);
    } catch (e) {}
  };

  // Super admin is uniquely rafa.marciooliveira@gmail.com
  const isSuperAdmin = useMemo(() => {
    if (!currentUser) return false;
    const email = currentUser.email?.toLowerCase();
    return email === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
  }, [currentUser]);

  // Diretoria Executiva check
  const isDiretoriaExecutiva = useMemo(() => {
    if (!currentUser) return false;
    if (isSuperAdmin) return true;
    const cat = String(currentMember?.category || '').trim().toUpperCase();
    if (cat === 'DIRETORIA EXECUTIVA') return true;
    const userEmail = currentUser.email?.toLowerCase();
    const uid = currentUser.uid;
    return adminList.some(
      a =>
        ((userEmail && a.email?.toLowerCase() === userEmail) || a.id === uid) &&
        (a.role === 'superadmin' || a.role === 'diretoria_executiva' || a.category === 'DIRETORIA EXECUTIVA')
    );
  }, [currentUser, isSuperAdmin, currentMember, adminList]);

  // Diretoria (Somente Diretoria or Diretoria Executiva or legacy Membro da Diretoria)
  const isDiretoria = useMemo(() => {
    if (!currentUser) return false;
    if (isDiretoriaExecutiva) return true;
    const cat = String(currentMember?.category || '').trim().toUpperCase();
    if (cat === 'DIRETORIA' || cat === 'MEMBRO DA DIRETORIA') return true;
    const userEmail = currentUser.email?.toLowerCase();
    const uid = currentUser.uid;
    return adminList.some(
      a =>
        ((userEmail && a.email?.toLowerCase() === userEmail) || a.id === uid) &&
        (a.role === 'diretoria' || a.role === 'admin' || a.category === 'DIRETORIA')
    );
  }, [currentUser, isDiretoriaExecutiva, currentMember, adminList]);

  // Tesoureiro role
  const isTesoureiro = useMemo(() => {
    if (!currentUser) return false;
    if (isSuperAdmin || isDiretoriaExecutiva) return true;
    const cat = String(currentMember?.category || '').trim().toUpperCase();
    if (cat === 'TESOUREIRO') return true;
    const userEmail = currentUser.email?.toLowerCase();
    const uid = currentUser.uid;
    return adminList.some(
      a =>
        ((userEmail && a.email?.toLowerCase() === userEmail) || a.id === uid) &&
        (a.role === 'tesoureiro' || a.category === 'TESOUREIRO')
    );
  }, [currentUser, isSuperAdmin, isDiretoriaExecutiva, currentMember, adminList]);

  // Conselho Fiscal role
  const isConselhoFiscal = useMemo(() => {
    if (!currentUser) return false;
    if (isSuperAdmin || isDiretoriaExecutiva) return false; // Has full power
    const cat = String(currentMember?.category || '').trim().toUpperCase();
    if (cat === 'CONSELHO FISCAL') return true;
    const userEmail = currentUser.email?.toLowerCase();
    const uid = currentUser.uid;
    return adminList.some(
      a =>
        ((userEmail && a.email?.toLowerCase() === userEmail) || a.id === uid) &&
        (a.role === 'conselho_fiscal' || a.category === 'CONSELHO FISCAL')
    );
  }, [currentUser, isSuperAdmin, isDiretoriaExecutiva, currentMember, adminList]);

  const canManageFinances = useMemo(() => {
    return isSuperAdmin || isDiretoriaExecutiva || isTesoureiro;
  }, [isSuperAdmin, isDiretoriaExecutiva, isTesoureiro]);

  const canViewFinances = useMemo(() => {
    return canManageFinances || isConselhoFiscal || isDiretoria;
  }, [canManageFinances, isConselhoFiscal, isDiretoria]);

  // Board Member: grants access to the Admin Dashboard (board, treasury, fiscal council or superadmin)
  const isBoardMember = useMemo(() => {
    return isSuperAdmin || isDiretoriaExecutiva || isDiretoria || isTesoureiro || isConselhoFiscal;
  }, [isSuperAdmin, isDiretoriaExecutiva, isDiretoria, isTesoureiro, isConselhoFiscal]);

  const isAdmin = isBoardMember;

  const boardRole = useMemo<BoardRole>(() => {
    if (isSuperAdmin) return 'superadmin';
    if (isDiretoriaExecutiva) return 'diretoria_executiva';
    if (isTesoureiro) return 'tesoureiro';
    if (isConselhoFiscal) return 'conselho_fiscal';
    if (isDiretoria) return 'diretoria';
    return null;
  }, [isSuperAdmin, isDiretoriaExecutiva, isTesoureiro, isConselhoFiscal, isDiretoria]);

  // Check whether user must change password on first login
  const mustChangePassword = useMemo(() => {
    if (!currentUser) return false;
    // Check if user authenticated with password provider
    const hasPasswordProvider = currentUser.providerData.some(p => p.providerId === 'password');
    if (!hasPasswordProvider) return false;

    // Check localStorage cache if they just changed it in this browser session
    const localCleared = localStorage.getItem(`pw_changed_${currentUser.uid}`) === 'true';
    if (localCleared) return false;

    // Check member profile
    if (currentMember?.mustChangePassword === true) return true;
    if (currentMember?.mustChangePassword === false) return false;

    // If member has no passwordChangedAt recorded, require change on first access
    if (currentMember && !currentMember.passwordChangedAt) {
      return true;
    }

    return false;
  }, [currentUser, currentMember]);

  // Listen to the admins collection
  useEffect(() => {
    const path = 'admins';
    const unsubscribe = onSnapshot(
      collection(db, path),
      snapshot => {
        const admins: AdminUser[] = [];
        snapshot.forEach(docSnap => {
          admins.push({ ...docSnap.data(), id: docSnap.id } as AdminUser);
        });
        setAdminList(admins);
      },
      error => {
        // Can be restricted if unauthenticated, non-fatal
        console.warn('Admins list sync:', error.message);
      }
    );
    return () => unsubscribe();
  }, []);

  // Sync active role with board member status: non-board members are locked to 'member'
  useEffect(() => {
    if (!currentUser) return;
    const saved = localStorage.getItem('associacao_active_role');
    if (!isBoardMember) {
      setActiveRoleState('member');
    } else {
      if (saved === 'member' || saved === 'admin') {
        setActiveRoleState(saved as ViewRole);
      } else {
        setActiveRoleState('admin');
      }
    }
  }, [isBoardMember, currentUser]);

  // Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async user => {
      setCurrentUser(user);
      setLoading(false);
      if (user && user.email) {
        const emailLower = user.email.toLowerCase();
        // Superadmin and authorized admins sync UID doc for direct Firestore rules access
        if (emailLower === BOOTSTRAP_ADMIN_EMAIL.toLowerCase()) {
          try {
            await setDoc(
              doc(db, 'admins', user.uid),
              {
                id: user.uid,
                uid: user.uid,
                email: emailLower,
                role: 'superadmin',
                category: 'DIRETORIA EXECUTIVA',
                name: 'Superadministrador Fundador',
                updatedAt: new Date().toISOString(),
              },
              { merge: true }
            );
          } catch (e) {
            // non-fatal
          }
        } else {
          // Check if newly logged in user is in admins collection by email
          try {
            const adminEmailDoc = await getDoc(doc(db, 'admins', emailLower));
            if (adminEmailDoc.exists()) {
              const adminData = adminEmailDoc.data();
              await setDoc(
                doc(db, 'admins', user.uid),
                {
                  ...adminData,
                  id: user.uid,
                  uid: user.uid,
                  email: emailLower,
                  updatedAt: new Date().toISOString(),
                },
                { merge: true }
              );
            }
          } catch (e) {
            // non-fatal
          }
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Listen to current user's Member document
  useEffect(() => {
    if (!currentUser) {
      setCurrentMember(null);
      setPreviousStatus(null);
      setMemberLoading(false);
      return;
    }

    setMemberLoading(true);
    const cacheKey = `associacao_cached_member_${currentUser.uid}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.userId === currentUser.uid) {
          setCurrentMember(parsed);
        }
      }
    } catch (e) {}

    const path = 'members';
    const q = query(collection(db, path), where('userId', '==', currentUser.uid));

    const unsubscribe = onSnapshot(
      q,
      snapshot => {
        if (!snapshot.empty) {
          // Sort documents by updatedAt or createdAt descending so the latest registered/edited member data is always loaded
          const sortedDocs = [...snapshot.docs].sort((a, b) => {
            const dataA = a.data();
            const dataB = b.data();
            const timeA = new Date(dataA.updatedAt || dataA.createdAt || 0).getTime();
            const timeB = new Date(dataB.updatedAt || dataB.createdAt || 0).getTime();
            return timeB - timeA;
          });
          const bestDoc = sortedDocs[0];
          const docData = bestDoc.data() as Member;
          const member: Member = {
            ...docData,
            id: bestDoc.id,
          };
          setCurrentMember(member);
          try {
            localStorage.setItem(cacheKey, JSON.stringify(member));
          } catch (e) {}

          // Detect status change to fire Push Notification
          if (previousStatus && previousStatus !== member.status) {
            let title = 'Atualização no seu Cadastro';
            let message = `O status do seu cadastro de sócio mudou para: ${member.status.toUpperCase()}`;
            let type: 'approval' | 'rejection' | 'expiration' | 'status_change' = 'status_change';

            if (member.status === 'aprovado') {
              title = '🎉 Cadastro Aprovado com Sucesso!';
              message = 'Parabéns! Sua carteirinha digital de sócio já está disponível para visualização imediata.';
              type = 'approval';
            } else if (member.status === 'rejeitado') {
              title = 'Ajuste Necessário no Cadastro';
              message = member.rejectionReason
                ? `Motivo: ${member.rejectionReason}`
                : 'Seu cadastro necessita de revisão pela administração.';
              type = 'rejection';
            } else if (member.status === 'expirado') {
              title = 'Carteirinha de Sócio Expirada';
              message = 'A vigência da sua carteirinha expirou. Solicite a renovação anual.';
              type = 'expiration';
            }

            triggerPushNotification(title, message, type);
          }
          setPreviousStatus(member.status);
        } else {
          setCurrentMember(null);
          try {
            localStorage.removeItem(cacheKey);
          } catch (e) {}
        }
        setMemberLoading(false);
      },
      error => {
        console.warn('Firestore snapshot sync notice for members:', error.message);
        setMemberLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser, previousStatus]);

  // Real-time synchronization of Active Card Template & Library
  useEffect(() => {
    const activeDocRef = doc(db, 'cardTemplates', 'active_template');
    const unsubActive = onSnapshot(
      activeDocRef,
      snap => {
        if (snap.exists()) {
          const activeData = { ...snap.data(), id: snap.id } as CardTemplate;
          setActiveTemplate(activeData);
          try {
            localStorage.setItem('associacao_active_template_cache', JSON.stringify(activeData));
          } catch (e) {}
        }
      },
      err => {
        console.warn('Sync notice on active_template:', err.message);
      }
    );

    const path = 'cardTemplates';
    const unsubList = onSnapshot(
      collection(db, path),
      snapshot => {
        if (!snapshot.empty) {
          const fetched: CardTemplate[] = [];
          let foundActiveFromList: CardTemplate | null = null;

          snapshot.forEach(docSnap => {
            if (docSnap.id === 'active_template') {
              foundActiveFromList = { ...docSnap.data(), id: docSnap.id } as CardTemplate;
            } else {
              fetched.push({ ...docSnap.data(), id: docSnap.id } as CardTemplate);
            }
          });

          if (fetched.length > 0) {
            setTemplates(fetched);
          } else {
            setTemplates(DEFAULT_TEMPLATES);
          }

          if (foundActiveFromList) {
            setActiveTemplate(foundActiveFromList);
            try {
              localStorage.setItem('associacao_active_template_cache', JSON.stringify(foundActiveFromList));
            } catch (e) {}
          }
        } else {
          setTemplates(DEFAULT_TEMPLATES);
        }
      },
      error => {
        console.warn('Templates fetch notice:', error.message);
      }
    );

    return () => {
      unsubActive();
      unsubList();
    };
  }, []);

  // Listen to Notifications for current user
  useEffect(() => {
    if (!currentUser) {
      setNotifications([]);
      return;
    }

    const path = 'notifications';
    const q = query(collection(db, path), where('userId', '==', currentUser.uid));

    const unsubscribe = onSnapshot(
      q,
      snapshot => {
        const notifs: UserNotification[] = [];
        snapshot.forEach(docSnap => {
          notifs.push({ ...docSnap.data(), id: docSnap.id } as UserNotification);
        });
        notifs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setNotifications(notifs);
      },
      error => {
        console.warn('Firestore snapshot sync notice for notifications:', error.message);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  const signInWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Google Sign-In Error:', error);
      throw error;
    }
  };

  const signInWithEmail = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const signUpWithEmail = async (email: string, pass: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    if (cred.user) {
      try {
        await sendEmailVerification(cred.user);
      } catch (e) {
        console.warn('Erro ao disparar envio inicial de confirmação:', e);
      }
    }
  };

  const sendVerificationEmail = async () => {
    if (!auth.currentUser) throw new Error('Nenhum usuário logado no momento.');
    await sendEmailVerification(auth.currentUser);
    triggerPushNotification(
      '📧 Confirmação de E-mail Enviada',
      `Um link de verificação foi enviado para ${auth.currentUser.email}.`,
      'approval'
    );
  };

  const logout = async () => {
    try {
      clearOfflineSavedCard();
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('associacao_') || k.startsWith('pw_changed_'))) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch (e) {
      // non-fatal
    }
    await signOut(auth);
    setCurrentMember(null);
    setActiveRole('member');
  };

  const reloadUser = async () => {
    if (auth.currentUser) {
      await auth.currentUser.reload();
      setCurrentUser({ ...auth.currentUser });
    }
  };

  const syncPublicCard = async (member: Partial<Member> & { id: string }) => {
    try {
      const publicDoc = {
        id: member.id,
        fullName: member.fullName || '',
        category: member.category || 'SÓCIO',
        status: member.status || 'pendente',
        validUntil: member.validUntil || DEFAULT_OFFICIAL_EXPIRY,
        photoUrl: member.photoUrl || '',
        lastGeneratedAt: member.lastGeneratedAt || new Date().toISOString(),
        lastViewToken: member.lastViewToken || 'live',
        userId: member.userId || auth.currentUser?.uid || '',
        updatedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'publicCards', member.id), publicDoc, { merge: true });
    } catch (err) {
      console.warn('Sync public card notice:', err);
    }
  };

  const markNotificationRead = async (id: string) => {
    const path = 'notifications';
    try {
      await updateDoc(doc(db, path, id), { read: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${path}/${id}`);
    }
  };

  const sendPasswordReset = async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase());
  };

  const changeInitialPassword = async (newPass: string) => {
    if (!currentUser) throw new Error('Usuário não autenticado.');
    await updatePassword(currentUser, newPass);
    const path = 'members';
    if (currentMember?.id) {
      try {
        await updateDoc(doc(db, path, currentMember.id), {
          mustChangePassword: false,
          passwordChangedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } catch (e) {
        console.warn('Notice updating member password change flag:', e);
      }
    }
    localStorage.setItem(`pw_changed_${currentUser.uid}`, 'true');
    triggerPushNotification(
      '🔒 Senha Alterada com Sucesso!',
      'Sua nova senha de acesso foi cadastrada e protegida com segurança.',
      'approval'
    );
  };

  const updateUserCategory = async (memberId: string, category: MemberCategory) => {
    const path = 'members';
    try {
      await updateDoc(doc(db, path, memberId), {
        category,
        updatedAt: new Date().toISOString(),
      });
      triggerPushNotification(
        'Categoria Atualizada',
        `A categoria do usuário foi alterada para ${category}.`,
        'approval'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `members/${memberId}`);
    }
  };

  const updateUserStatus = async (memberId: string, status: MemberStatus) => {
    const path = 'members';
    try {
      await updateDoc(doc(db, path, memberId), {
        status,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `members/${memberId}`);
    }
  };

  const updateUserForcePassword = async (memberId: string, force: boolean) => {
    const path = 'members';
    try {
      await updateDoc(doc(db, path, memberId), {
        mustChangePassword: force,
        updatedAt: new Date().toISOString(),
      });
      triggerPushNotification(
        'Segurança de Acesso',
        force ? 'O usuário deverá trocar a senha no próximo acesso.' : 'Exigência de troca de senha removida.',
        'approval'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `members/${memberId}`);
    }
  };

  const addAdmin = async (
    email: string,
    name?: string,
    role: 'diretoria_executiva' | 'diretoria' | 'admin' | 'tesoureiro' | 'conselho_fiscal' = 'diretoria_executiva',
    category: 'DIRETORIA EXECUTIVA' | 'DIRETORIA' | 'TESOUREIRO' | 'CONSELHO FISCAL' = 'DIRETORIA EXECUTIVA'
  ) => {
    const cleanEmail = email.trim().toLowerCase();
    const docId = cleanEmail.replace(/[@.]/g, '_');
    const path = 'admins';
    const adminRecord = {
      id: cleanEmail,
      email: cleanEmail,
      name: name || '',
      role: role,
      category: category,
      addedBy: currentUser?.email || 'superadmin',
      createdAt: new Date().toISOString(),
    };

    try {
      // 1. Grava com ID do email exato para compatibilidade direta com request.auth.token.email no firestore.rules
      await setDoc(doc(db, path, cleanEmail), adminRecord);
      // 2. Grava também com ID sanitizado para compatibilidade legada
      if (docId !== cleanEmail) {
        await setDoc(doc(db, path, docId), { ...adminRecord, id: docId });
      }
      // 3. Se o usuário já tiver cadastro de sócio com este email, busca seu userId e grava admins/{userId}
      try {
        const q = query(collection(db, 'members'), where('email', '==', cleanEmail));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const m = snap.docs[0].data();
          if (m.userId) {
            await setDoc(
              doc(db, path, m.userId),
              { ...adminRecord, id: m.userId, uid: m.userId },
              { merge: true }
            );
          }
        }
      } catch (e) {
        // non-fatal
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `admins/${cleanEmail}`);
    }
  };

  const removeAdmin = async (adminId: string) => {
    const path = 'admins';
    try {
      await deleteDoc(doc(db, path, adminId));
      const cleanEmail = adminId.toLowerCase();
      const sanitized = cleanEmail.replace(/[@.]/g, '_');
      if (sanitized !== cleanEmail) {
        try {
          await deleteDoc(doc(db, path, sanitized));
        } catch (e) {}
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `admins/${adminId}`);
    }
  };

  const saveActiveTemplate = async (tmpl: CardTemplate) => {
    const updated: CardTemplate = {
      ...tmpl,
      isDefault: true,
      updatedAt: new Date().toISOString(),
    };

    // 1. Immediately update local state & browser storage cache
    setActiveTemplate(updated);
    try {
      localStorage.setItem('associacao_active_template_cache', JSON.stringify(updated));
    } catch (e) {}

    // 2. Persist to Firestore: both as canonical 'active_template' and in preset template document
    const path = 'cardTemplates';
    try {
      // Save canonical active template
      await setDoc(doc(db, path, 'active_template'), {
        ...updated,
        id: 'active_template',
      });

      // If it's a specific library template, also persist it there
      if (tmpl.id && tmpl.id !== 'active_template') {
        await setDoc(doc(db, path, tmpl.id), updated);
      }
    } catch (err) {
      console.error('Erro ao salvar template ativo no Firestore:', err);
      throw err;
    }
  };

  const refreshTemplates = () => {
    // will re-sync
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        currentMember,
        memberLoading,
        isAdmin,
        isSuperAdmin,
        isDiretoriaExecutiva,
        isDiretoria,
        isBoardMember,
        isTesoureiro,
        isConselhoFiscal,
        canManageFinances,
        canViewFinances,
        boardRole,
        adminList,
        theme,
        toggleTheme,
        addAdmin,
        removeAdmin,
        activeRole,
        setActiveRole,
        activePortalTab,
        setActivePortalTab,
        loading,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        logout,
        reloadUser,
        sendPasswordReset,
        sendVerificationEmail,
        syncPublicCard,
        mustChangePassword,
        changeInitialPassword,
        updateUserCategory,
        updateUserStatus,
        updateUserForcePassword,
        notifications,
        markNotificationRead,
        activeTemplate,
        setActiveTemplate,
        saveActiveTemplate,
        templates,
        refreshTemplates,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
