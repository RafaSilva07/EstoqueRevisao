import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EmptyState, LoadingState, Notice } from './components';
import { formatDate } from './format';

describe('componentes de interface', () => {
  it('formata datas de negocio sem depender do fuso horario', () => {
    expect(formatDate('2026-08-31')).toBe('31/08/2026');
  });

  it('renderiza loading com status acessivel', () => {
    const html = renderToStaticMarkup(<LoadingState label="Carregando produtos" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('Carregando produtos');
  });

  it('renderiza estado vazio orientativo e sua acao', () => {
    const html = renderToStaticMarkup(<EmptyState title="Nenhum produto cadastrado" description="Cadastre o primeiro produto para comecar." action={<button>Novo produto</button>} />);
    expect(html).toContain('Nenhum produto cadastrado');
    expect(html).toContain('Novo produto');
  });

  it('anuncia erros como alerta e sucessos como status', () => {
    expect(renderToStaticMarkup(<Notice kind="error">Falha</Notice>)).toContain('role="alert"');
    expect(renderToStaticMarkup(<Notice kind="success">Salvo</Notice>)).toContain('role="status"');
  });
});
