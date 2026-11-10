/** Planilha do organograma (modelo, leitura e junção), acentos das notícias e aniversariantes sem repetição. */
import { describe, expect, it } from 'vitest';
import { readXlsx, writeXlsx, zip } from '../src/utils/xlsx.ts';
import { instructionRows, mergeSheet, parseSheet, templateRows } from '../src/modules/orgchart/orgSheet.ts';
import { decodeEntities } from '../src/shared/rss.ts';
import { dependentText, uniqueBirthdays } from '../src/shared/birthdays.ts';
import type { MemberDoc, OrgPosition } from '../src/shared/types.ts';

const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
let n = 0;
const newId = () => `novo${++n}`;

describe('planilha (.xlsx)', () => {
  it('o modelo gerado abre de volta igual, com acento e caracteres especiais', async () => {
    const rows = [['Cargo', 'Aba', 'Quem ocupa'], ['Presidente', 'Diretoria', 'João & Maria <Silva>'], ['Rainha da beleza', 'Beleza', '']];
    const blob = await writeXlsx([{ name: 'Organograma', rows, boldHeader: true }, { name: 'Instruções', rows: instructionRows() }]);
    const back = await readXlsx(await bytesOf(blob));
    expect(back.slice(0, 3)).toEqual([rows[0], rows[1], ['Rainha da beleza', 'Beleza']]);
  });

  it('lê partes sem compressão e recusa o que não é planilha', async () => {
    const enc = new TextEncoder();
    const sheet = '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>Vice</t></is></c></row><row r="3"><c r="B3"><v>2</v></c></row></sheetData></worksheet>';
    const bytes = await zip([
      { name: 'xl/workbook.xml', data: enc.encode('<workbook><sheets><sheet name="A" sheetId="1" r:id="rId1"/></sheets></workbook>') },
      { name: 'xl/_rels/workbook.xml.rels', data: enc.encode('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>') },
      { name: 'xl/sharedStrings.xml', data: enc.encode('<sst><si><r><t>Tesou</t></r><r><t>reiro</t></r></si></sst>') },
      { name: 'xl/worksheets/sheet1.xml', data: enc.encode(sheet) },
    ], false);
    expect(await readXlsx(bytes)).toEqual([['Tesoureiro', '', 'Vice'], [], ['', '2']]);
    await expect(readXlsx(enc.encode('isto não é zip'))).rejects.toThrow(/não é uma planilha/);
  });
});

describe('organograma pela planilha', () => {
  const sheet = [
    ['Cargo', 'Aba', 'Quem ocupa', 'Linha', 'Abaixo de', 'Destaque'],
    ['Presidente', 'Diretoria', 'Rafael Oliveira', '1', '', ''],
    ['Vice-presidente', '', '', '', 'Presidente', ''],
    ['Diretor de tiro', 'Diretoria', '', '2', '', ''],
    ['Tesoureiro', 'Diretoria', 'Fulano Sem Cadastro', '2', '', ''],
    ['Vice-tesoureiro', 'Diretoria', '', '', 'Tesoureiro', ''],
    ['Conselho fiscal', 'Diretoria', '', 'x', '', ''],
    ['', 'Diretoria', 'sem cargo', '', '', ''],
    ['Rei do tiro', 'Majestades do tiro', '', '', '', 'sim'],
  ];

  it('entende as colunas, repete a aba de cima e avisa o que não deu para usar', () => {
    const r = parseSheet(sheet);
    expect(r.rows.map(x => x.title)).toEqual(['Presidente', 'Vice-presidente', 'Diretor de tiro', 'Tesoureiro', 'Vice-tesoureiro', 'Conselho fiscal', 'Rei do tiro']);
    expect(r.rows[1].group).toBe('Diretoria');
    expect(r.rows[6]).toMatchObject({ group: 'Majestades do tiro', highlight: true });
    expect(r.rows[5].row).toBeUndefined();
    expect(r.problems.join(' ')).toMatch(/Linha 7.*"x"/);
    expect(r.problems.join(' ')).toMatch(/Linha 8: falta o nome do cargo/);
  });

  it('junta com o que existe: atualiza o igual, liga o sócio pelo nome, monta "abaixo de" e não tira cargo com acesso', () => {
    const current: OrgPosition[] = [
      { id: 'p1', title: 'Presidente', group: 'Diretoria', order: 1, highlight: false, roleId: 'presidente', memberId: 'mX', personName: 'Outro' },
      { id: 'p9', title: 'Secretário', group: 'Diretoria', order: 2, highlight: false, roleId: 'secretario', memberId: 'mS', personName: 'Sec' },
      { id: 'p8', title: 'Orador', group: 'Diretoria', order: 3, highlight: false },
    ];
    const { rows } = parseSheet(sheet);
    const members = [{ id: 'm1', fullName: 'Rafael Oliveira' }];
    const j = mergeSheet(current, rows, { mode: 'juntar', members, newId });
    const by = (t: string) => j.positions.find(p => p.title === t)!;
    expect(by('Presidente').id).toBe('p1');
    // Cargo com acesso: quem ocupa só muda em Passar o cargo
    expect(by('Presidente').memberId).toBe('mX');
    expect(j.notes.join(' ')).toMatch(/Passar o cargo/);
    expect(by('Vice-presidente').under).toBe('p1');
    expect(by('Vice-tesoureiro').under).toBe(by('Tesoureiro').id);
    expect(by('Tesoureiro')).toMatchObject({ personName: 'Fulano Sem Cadastro', row: 2 });
    expect(by('Orador')).toBeTruthy();
    expect(j.groupOrder).toEqual(['Diretoria', 'Majestades do tiro']);

    const tr = mergeSheet(current, rows, { mode: 'trocar', members, newId });
    expect(tr.positions.some(p => p.title === 'Orador')).toBe(false);
    expect(tr.kept).toEqual(['Secretário']);
    expect(tr.removed).toBe(1);
  });

  it('o modelo traz os cargos de hoje com linha e "abaixo de" pelo nome', () => {
    const rows = templateRows(
      [
        { id: 'a', title: 'Tesoureiro', group: 'Diretoria', order: 1, highlight: false, row: 2 },
        { id: 'b', title: 'Vice-tesoureiro', group: 'Diretoria', order: 2, highlight: false, under: 'a' },
        { id: 'c', title: 'Rei', group: 'Majestades', order: 0, highlight: true },
      ],
      ['Diretoria', 'Majestades']
    );
    expect(rows[1]).toEqual(['Tesoureiro', 'Diretoria', '', '2', '', '']);
    expect(rows[2]).toEqual(['Vice-tesoureiro', 'Diretoria', '', '', 'Tesoureiro', '']);
    expect(rows[3]).toEqual(['Rei', 'Majestades', '', '', '', 'sim']);
  });
});

describe('acentos das notícias', () => {
  it('decodifica entidades com nome (Latin-1), números e escape duplo', () => {
    expect(decodeEntities('O brilho da tradi&ccedil;&atilde;o: vem a&iacute; o Baile &agrave; Luz')).toBe('O brilho da tradição: vem aí o Baile à Luz');
    expect(decodeEntities('Rep&amp;oacute;rter Gabriel Junior')).toBe('Repórter Gabriel Junior');
    expect(decodeEntities('m&ecirc;s &#233; &#x00e7; &sup2; &euro;')).toBe('mês é ç ² €');
    expect(decodeEntities('&naoexiste; fica')).toBe('&naoexiste; fica');
  });
});

describe('aniversariantes', () => {
  const m = (id: string, p: Partial<MemberDoc>) => ({ id, fullName: 'Geancarlo Oliveira', displayName: 'Geancarlo O.', categoryId: 'x', categoryName: 'x', status: 'ativo', isMinor: true, groups: [], custom: {}, createdAt: '', updatedAt: '', birthMonthDay: '11-22', birthYear: 2015, ...p }) as MemberDoc & { id: string };
  it('a mesma pessoa aparece uma vez e o dependente diz de quem é', () => {
    const list = uniqueBirthdays([m('a', { dependentOf: 'pai' }), m('b', { dependentOf: 'mae' }), m('c', { fullName: 'Claudinei S.', birthMonthDay: '11-21' })]);
    expect(list.map(x => x.id)).toEqual(['a', 'c']);
    expect(dependentText(m('a', { custom: { parentesco: 'Filho(a)' } }), 'Rafael Oliveira', 'Maria Oliveira')).toBe('Filho(a) de Rafael Oliveira e Maria Oliveira');
    expect(dependentText(m('a', { custom: { parentesco: 'Cônjuge ou companheiro(a)' } }), 'Rafael')).toBe('Cônjuge de Rafael');
    expect(dependentText(m('a', {}), 'Rafael')).toBe('Dependente de Rafael');
  });
});

describe('cargo e papel de mesmo nome', () => {
  it('reconhece com acento, (a), feminino e maiúsculas; não confunde cargos diferentes', async () => {
    const { roleForTitle, sameRoleName } = await import('../src/shared/roleMatch.ts');
    const roles = [{ id: 'socio', name: 'Sócio(a)' }, { id: 'secretario', name: 'Secretário(a)' }, { id: 'tesoureiro', name: 'Tesoureiro(a)' }, { id: 'presidente', name: 'Presidente' }];
    expect(roleForTitle('Secretária', roles)?.id).toBe('secretario');
    expect(roleForTitle('SECRETARIO', roles)?.id).toBe('secretario');
    expect(roleForTitle('Tesoureira', roles)?.id).toBe('tesoureiro');
    expect(roleForTitle('Presidente', roles)?.id).toBe('presidente');
    expect(roleForTitle('Vice-presidente', roles)).toBeUndefined();
    expect(roleForTitle('Vice Secretária', roles)).toBeUndefined();
    expect(roleForTitle('Sócia', roles)).toBeUndefined();
    expect(sameRoleName('Diretor(a) de tiro', 'Diretora de tiro')).toBe(true);
  });
});
