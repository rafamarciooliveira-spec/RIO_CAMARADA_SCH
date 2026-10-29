import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import {
  User,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase/config.ts';
import { Member, ViewRole, UserNotification, CardTemplate, AdminUser } from '../types/index.ts';
import { triggerPushNotification } from '../utils/pushNotification.ts';
import { DEFAULT_TEMPLATES } from '../data/defaultTemplates.ts';
import { deleteDoc } from 'firebase/firestore';

const BOOTSTRAP_ADMIN_EMAIL = 'rafa.marciooliveira@gmail.com';

interface AuthContextType {
  currentUser: User | null;
  currentMember: Member | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  adminList: AdminUser[];
  addAdmin: (email: string, name?: string) => Promise<void>;
  removeAdmin: (adminId: string) => Promise<void>;
  activeRole: ViewRole;
  setActiveRole: (role: ViewRole) => void;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
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
  const [adminList, setAdminList] = useState<AdminUser[]>([]);
  const [activeRole, setActiveRole] = useState<ViewRole>('member');
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [templates, setTemplates] = useState<CardTemplate[]>(DEFAULT_TEMPLATES);
  const [activeTemplate, setActiveTemplate] = useState<CardTemplate>(() => {
    try {
      const cached = localStorage.getItem('associacao_active_template_cache');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return DEFAULT_TEMPLATES[0];
  });
  const [previousStatus, setPreviousStatus] = useState<string | null>(null);

  // Super admin is uniquely rafa.marciooliveira@gmail.com
  const isSuperAdmin = useMemo(() => {
    if (!currentUser) return false;
    const email = currentUser.email?.toLowerCase();
    return email === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
  }, [currentUser]);

  // Compute isAdmin: superadmin OR in the dynamic admins list
  const isAdmin = useMemo(() => {
    if (!currentUser) return false;
    if (isSuperAdmin) return true;
    const userEmail = currentUser.email?.toLowerCase();
    const uid = currentUser.uid;
    return adminList.some(
      a => (userEmail && a.email?.toLowerCase() === userEmail) || a.id === uid || a.id === userEmail
    );
  }, [currentUser, isSuperAdmin, adminList]);

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

  // Sync active role with admin status initially
  useEffect(() => {
    if (isAdmin) {
      setActiveRole('admin');
    } else {
      setActiveRole('member');
    }
  }, [isAdmin]);

  // Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      setCurrentUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Listen to current user's Member document
  useEffect(() => {
    if (!currentUser) {
      setCurrentMember(null);
      setPreviousStatus(null);
      return;
    }

    const path = 'members';
    const q = query(collection(db, path), where('userId', '==', currentUser.uid));

    const unsubscribe = onSnapshot(
      q,
      snapshot => {
        if (!snapshot.empty) {
          const docData = snapshot.docs[0].data() as Member;
          const member: Member = {
            ...docData,
            id: snapshot.docs[0].id,
          };
          setCurrentMember(member);

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
        }
      },
      error => {
        console.warn('Firestore snapshot sync notice for members:', error.message);
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
          } else if (fetched.length > 0) {
            const def = fetched.find(t => t.isDefault) || fetched[0];
            setActiveTemplate(def);
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
    await createUserWithEmailAndPassword(auth, email, pass);
  };

  const logout = async () => {
    await signOut(auth);
    setCurrentMember(null);
    setActiveRole('member');
  };

  const markNotificationRead = async (id: string) => {
    const path = 'notifications';
    try {
      await updateDoc(doc(db, path, id), { read: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${path}/${id}`);
    }
  };

  const addAdmin = async (email: string, name?: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const docId = cleanEmail.replace(/[@.]/g, '_');
    const path = 'admins';
    try {
      await setDoc(doc(db, path, docId), {
        id: docId,
        email: cleanEmail,
        name: name || '',
        role: 'admin',
        addedBy: currentUser?.email || 'superadmin',
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `admins/${docId}`);
    }
  };

  const removeAdmin = async (adminId: string) => {
    const path = 'admins';
    try {
      await deleteDoc(doc(db, path, adminId));
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
      console.warn('Erro ao salvar template ativo no Firestore:', err);
      // Non-fatal fallback for permission or offline mode
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
        isAdmin,
        isSuperAdmin,
        adminList,
        addAdmin,
        removeAdmin,
        activeRole,
        setActiveRole,
        loading,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        logout,
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
