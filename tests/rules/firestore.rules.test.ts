/**
 * Testes das regras do Firestore (fase 0) no emulador.
 * Rodar: npm run test:rules   (precisa de Java instalado; o Firebase CLI sobe o emulador)
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, addDoc, deleteDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;

const ADMIN_EMAIL = 'diretoria@teste.local';
const ADMIN_KEY = 'diretoria_teste_local';
const SUPER_EMAIL = 'presidencia@teste.local';
const SUPER_KEY = 'presidencia_teste_local';

const baseMember = {
  id: 'm1',
  userId: 'socio1',
  fullName: 'Pessoa Teste',
  cpf: '000.000.000-00',
  birthDate: '1990-01-01',
  email: 'socio1@teste.local',
  phone: '',
  photoUrl: '',
  category: 'SÓCIO',
  status: 'pendente',
  rejectionReason: '',
  lgpdConsent: true,
  lgpdConsentDate: '2026-11-02T00:00:00.000Z',
  validUntil: '',
  renewalCount: 0,
  createdAt: '2026-11-02T00:00:00.000Z',
  updatedAt: '2026-11-02T00:00:00.000Z',
};

const socio = () => env.authenticatedContext('socio1', { email: 'socio1@teste.local', email_verified: true }).firestore();
const outroSocio = () => env.authenticatedContext('socio2', { email: 'socio2@teste.local', email_verified: true }).firestore();
const admin = () => env.authenticatedContext('adm1', { email: ADMIN_EMAIL, email_verified: true }).firestore();
const adminNaoVerificado = () => env.authenticatedContext('adm1', { email: ADMIN_EMAIL, email_verified: false }).firestore();
const superAdmin = () => env.authenticatedContext('sup1', { email: SUPER_EMAIL, email_verified: true }).firestore();
const anonimo = () => env.unauthenticatedContext().firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-sodalis',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admins', ADMIN_KEY), { id: ADMIN_KEY, email: ADMIN_EMAIL, role: 'admin', createdAt: 'x' });
    await setDoc(doc(db, 'admins', SUPER_KEY), { id: SUPER_KEY, email: SUPER_EMAIL, role: 'superadmin', createdAt: 'x' });
    await setDoc(doc(db, 'members', 'm1'), baseMember);
    await setDoc(doc(db, 'members', 'm2'), { ...baseMember, id: 'm2', userId: 'socio2', status: 'aprovado', validUntil: '2027-11-02' });
    await setDoc(doc(db, 'publicCards', 'm2'), {
      memberId: 'm2', displayName: 'Pessoa T.', category: 'SÓCIO', status: 'aprovado', validUntil: '2027-11-02', updatedAt: 'x',
    });
  });
});

describe('dados pessoais dos sócios', () => {
  it('anônimo não lê sócio aprovado (antes lia CPF pelo ID do QR)', async () => {
    await assertFails(getDoc(doc(anonimo(), 'members', 'm2')));
  });

  it('outro sócio não lê o cadastro alheio', async () => {
    await assertFails(getDoc(doc(outroSocio(), 'members', 'm1')));
  });

  it('sócio lê o próprio cadastro e consulta só os seus', async () => {
    await assertSucceeds(getDoc(doc(socio(), 'members', 'm1')));
    await assertSucceeds(getDocs(query(collection(socio(), 'members'), where('userId', '==', 'socio1'))));
    await assertFails(getDocs(collection(socio(), 'members')));
  });

  it('anônimo lê só a projeção mínima da carteirinha', async () => {
    await assertSucceeds(getDoc(doc(anonimo(), 'publicCards', 'm2')));
    await assertFails(getDocs(collection(anonimo(), 'publicCards')));
  });

  it('sócio não grava a projeção pública', async () => {
    await assertFails(setDoc(doc(socio(), 'publicCards', 'm1'), {
      memberId: 'm1', displayName: 'X', category: 'SÓCIO', status: 'aprovado', validUntil: '2099-01-01', updatedAt: 'x',
    }));
  });
});

describe('o sócio não se promove', () => {
  it('não cria cadastro já aprovado nem como diretoria', async () => {
    const db = env.authenticatedContext('socio3', { email: 's3@teste.local', email_verified: true }).firestore();
    const novo = { ...baseMember, id: 'm3', userId: 'socio3', email: 's3@teste.local' };
    await assertFails(setDoc(doc(db, 'members', 'm3'), { ...novo, status: 'aprovado' }));
    await assertFails(setDoc(doc(db, 'members', 'm3'), { ...novo, category: 'MEMBRO DA DIRETORIA' }));
    await assertFails(setDoc(doc(db, 'members', 'm3'), { ...novo, validUntil: '2099-12-31' }));
    await assertFails(setDoc(doc(db, 'members', 'm3'), { ...novo, membershipNumber: '0001' }));
    await assertSucceeds(setDoc(doc(db, 'members', 'm3'), novo));
  });

  it('não altera categoria, matrícula, renovações nem validade', async () => {
    await assertFails(updateDoc(doc(socio(), 'members', 'm1'), { category: 'MEMBRO DA DIRETORIA' }));
    await assertFails(updateDoc(doc(socio(), 'members', 'm1'), { membershipNumber: '0001' }));
    await assertFails(updateDoc(doc(socio(), 'members', 'm1'), { renewalCount: 5 }));
    await assertFails(updateDoc(doc(socio(), 'members', 'm1'), { validUntil: '2099-12-31' }));
    await assertFails(updateDoc(doc(socio(), 'members', 'm1'), { status: 'aprovado' }));
  });

  it('corrige dados enquanto pendente', async () => {
    await assertSucceeds(updateDoc(doc(socio(), 'members', 'm1'), { fullName: 'Pessoa Teste Corrigida', updatedAt: 'y' }));
  });

  it('aprovado só altera contato, foto e selo; pode pedir renovação', async () => {
    await assertFails(updateDoc(doc(outroSocio(), 'members', 'm2'), { fullName: 'Outro Nome' }));
    await assertSucceeds(updateDoc(doc(outroSocio(), 'members', 'm2'), { phone: '(47) 0000-0000', updatedAt: 'y' }));
    await assertSucceeds(updateDoc(doc(outroSocio(), 'members', 'm2'), { lastViewToken: 'AUTH-ABC', lastGeneratedAt: 'y' }));
    await assertSucceeds(updateDoc(doc(outroSocio(), 'members', 'm2'), { status: 'pendente', updatedAt: 'y' }));
  });
});

describe('papéis de administração', () => {
  it('admin com e-mail verificado aprova; sem verificação, não', async () => {
    await assertFails(updateDoc(doc(adminNaoVerificado(), 'members', 'm1'), { status: 'aprovado' }));
    await assertSucceeds(updateDoc(doc(admin(), 'members', 'm1'), { status: 'aprovado', validUntil: '2027-11-02' }));
  });

  it('e-mail que o código antigo tratava como super admin não tem poder nenhum', async () => {
    const db = env.authenticatedContext('x', { email: 'super-admin-antigo@exemplo.invalid', email_verified: true }).firestore();
    await assertFails(getDocs(collection(db, 'members')));
    await assertFails(setDoc(doc(db, 'admins', 'qualquer_teste_local'), { id: 'qualquer_teste_local', email: 'qualquer@teste.local', role: 'admin', createdAt: 'x' }));
  });

  it('sócio não lista admins nem se torna admin', async () => {
    await assertFails(getDocs(collection(socio(), 'admins')));
    await assertFails(setDoc(doc(socio(), 'admins', 'socio1_teste_local'), { id: 'socio1_teste_local', email: 'socio1@teste.local', role: 'admin', createdAt: 'x' }));
  });

  it('admin comum não gerencia admins; superadmin gerencia', async () => {
    await assertFails(getDocs(collection(admin(), 'admins')));
    await assertSucceeds(getDoc(doc(admin(), 'admins', ADMIN_KEY)));
    await assertSucceeds(getDocs(collection(superAdmin(), 'admins')));
    await assertSucceeds(setDoc(doc(superAdmin(), 'admins', 'novo_teste_local'), {
      id: 'novo_teste_local', email: 'novo@teste.local', name: '', role: 'admin', addedBy: 'sup1', createdAt: 'x',
    }));
    // chave precisa bater com o e-mail
    await assertFails(setDoc(doc(superAdmin(), 'admins', 'outra_chave'), {
      id: 'outra_chave', email: 'novo@teste.local', role: 'admin', createdAt: 'x',
    }));
    await assertSucceeds(deleteDoc(doc(superAdmin(), 'admins', ADMIN_KEY)));
  });
});

describe('notificações, e-mails, configurações e auditoria', () => {
  it('sócio não cria notificação para outra pessoa', async () => {
    await assertFails(setDoc(doc(socio(), 'notifications', 'n1'), {
      id: 'n1', userId: 'socio2', title: 'Falsa', message: 'x', type: 'approval', read: false, createdAt: 'x',
    }));
    await assertSucceeds(setDoc(doc(socio(), 'notifications', 'n2'), {
      id: 'n2', userId: 'socio1', title: 'Cadastro enviado', message: 'x', type: 'status_change', read: false, createdAt: 'x',
    }));
  });

  it('sócio não forja registro de e-mail nem lê configurações', async () => {
    await assertFails(setDoc(doc(socio(), 'emailDispatches', 'd1'), { userId: 'socio1', status: 'enviado' }));
    await assertFails(getDoc(doc(socio(), 'systemSettings', 'rejection_email')));
  });

  it('auditoria só recebe acréscimos do próprio admin', async () => {
    await assertSucceeds(addDoc(collection(admin(), 'auditLogs'), { action: 'members.export_csv', actorUid: 'adm1', rowCount: 1, createdAt: 'x' }));
    await assertFails(addDoc(collection(admin(), 'auditLogs'), { action: 'members.export_csv', actorUid: 'outro', rowCount: 1, createdAt: 'x' }));
    await assertFails(addDoc(collection(socio(), 'auditLogs'), { action: 'x', actorUid: 'socio1', rowCount: 1, createdAt: 'x' }));
  });
});
