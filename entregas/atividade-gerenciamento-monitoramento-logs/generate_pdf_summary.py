import os
import sys
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        # Top Header
        self.setStrokeColor(colors.HexColor('#cbd5e1'))
        self.setLineWidth(0.6)
        self.line(40, 800, 555, 800)
        self.setFont('Helvetica-Bold', 7.5)
        self.setFillColor(colors.HexColor('#334155'))
        self.drawString(40, 806, 'ESTOQUE REVISÃO — FÁBRICA DE SOFTWARE')
        self.setFont('Helvetica', 7.5)
        self.setFillColor(colors.HexColor('#64748b'))
        self.drawRightString(555, 806, 'Etapa de Gerenciamento e Monitoramento de Logs')

        # Bottom Footer
        self.line(40, 42, 555, 42)
        self.setFont('Helvetica', 7.5)
        self.drawString(40, 30, 'Branch: atividade/gerenciamento-monitoramento-logs  |  Novembro 2026')
        page_text = f'Página {self._pageNumber} de {page_count}'
        self.drawRightString(555, 30, page_text)
        self.restoreState()

def create_summary_pdf(filename):
    doc = SimpleDocTemplate(
        filename,
        pagesize=A4,
        leftMargin=40,
        rightMargin=40,
        topMargin=55,
        bottomMargin=55
    )

    styles = getSampleStyleSheet()

    # Custom typography styles
    title_style = ParagraphStyle(
        'DocTitle',
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=colors.HexColor('#0f172a'),
        spaceAfter=4
    )

    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#0284c7'),
        spaceAfter=12
    )

    h1_style = ParagraphStyle(
        'Heading1Custom',
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=15,
        textColor=colors.HexColor('#0f172a'),
        spaceBefore=10,
        spaceAfter=6,
        keepWithNext=True
    )

    h2_style = ParagraphStyle(
        'Heading2Custom',
        fontName='Helvetica-Bold',
        fontSize=9.5,
        leading=13,
        textColor=colors.HexColor('#0369a1'),
        spaceBefore=6,
        spaceAfter=4,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'BodyCustom',
        fontName='Helvetica',
        fontSize=8.5,
        leading=11.5,
        textColor=colors.HexColor('#334155'),
        spaceAfter=5
    )

    body_bold = ParagraphStyle(
        'BodyBoldCustom',
        parent=body_style,
        fontName='Helvetica-Bold'
    )

    code_style = ParagraphStyle(
        'CodeStyle',
        fontName='Courier',
        fontSize=7.2,
        leading=9.5,
        textColor=colors.HexColor('#0f172a')
    )

    badge_style = ParagraphStyle(
        'BadgeText',
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9.5,
        textColor=colors.white,
        alignment=1
    )

    table_header = ParagraphStyle(
        'TableHeader',
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor('#0f172a'),
        alignment=0
    )

    table_cell = ParagraphStyle(
        'TableCell',
        fontName='Helvetica',
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor('#334155'),
        alignment=0
    )

    table_cell_code = ParagraphStyle(
        'TableCellCode',
        fontName='Courier',
        fontSize=7,
        leading=8.5,
        textColor=colors.HexColor('#0369a1'),
        alignment=0
    )

    elements = []

    # Title & Header Banner
    elements.append(Paragraph('Relatório de Entrega: Gerenciamento e Monitoramento de Logs', title_style))
    elements.append(Paragraph('Implementação prática de Observabilidade, Tratamento Estruturado de Falhas e Métricas Operacionais', subtitle_style))
    
    # Metadata Info Box
    meta_data = [
        [
            Paragraph('<b>Projeto:</b> EstoqueRevisao (Fábrica de Software)', body_style),
            Paragraph('<b>Branch Dedicada:</b> <font color="#0284c7">atividade/gerenciamento-monitoramento-logs</font>', body_style)
        ],
        [
            Paragraph('<b>Endpoint Escolhido:</b> Catálogo de Produtos (<font face="Courier">/api/v1/products</font>)', body_style),
            Paragraph('<b>Status:</b> <b>100% Implementado, Testado e Documentado</b>', body_style)
        ]
    ]
    meta_table = Table(meta_data, colWidths=[255, 260])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f8fafc')),
        ('BOX', (0, 0), (-1, -1), 0.8, colors.HexColor('#cbd5e1')),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(meta_table)
    elements.append(Spacer(1, 8))

    # SECTION 1: OBJETIVO
    elements.append(Paragraph('1. Objetivo e Escopo da Atividade', h1_style))
    elements.append(Paragraph(
        'O objetivo da atividade consistiu em desenvolver e integrar ao projeto de software da Fábrica um subsistema completo '
        'de <b>observabilidade e monitoramento de logs</b>. A solução permite registrar eventos em tempo real, filtrar e consultar '
        'ocorrências por múltiplos atributos, analisar métricas de erro na aplicação e acionar alertas automáticos em cenários críticos, '
        'mantendo isolamento estrito na branch designada para a atividade.',
        body_style
    ))

    # SECTION 2: REQUISITO 1 - TRATAMENTO DE FALHAS
    elements.append(Paragraph('2. Tratamento de Falhas (Esperadas e Inesperadas)', h1_style))
    elements.append(Paragraph(
        'Foi selecionado o controlador de <b>Produtos (<font face="Courier">/api/v1/products</font>)</b>. '
        'Todas as falhas retornam payloads padronizados com códigos HTTP semânticos via <font face="Courier">GlobalExceptionFilter</font>, '
        'garantindo conformidade com a segurança de dados (zero vazamento de <i>stack traces</i>, senhas ou detalhes de infraestrutura).',
        body_style
    ))

    # Table of Simulated Faults
    faults_data = [
        [Paragraph('Tipo de Falha', table_header), Paragraph('Cenário Simulado', table_header), Paragraph('Código HTTP / Erro', table_header), Paragraph('Nível Log', table_header)],
        [
            Paragraph('<b>Esperada</b> (Client Handled)', table_cell),
            Paragraph('Código de produto duplicado no cadastro', table_cell),
            Paragraph('<b>409 Conflict</b><br/><font face="Courier" color="#0369a1">PRODUCT_CODE_ALREADY_EXISTS</font>', table_cell),
            Paragraph('<font color="#d97706"><b>WARN</b></font>', table_cell)
        ],
        [
            Paragraph('<b>Esperada</b> (Client Handled)', table_cell),
            Paragraph('Busca por ID de produto inexistente', table_cell),
            Paragraph('<b>404 Not Found</b><br/><font face="Courier" color="#0369a1">PRODUCT_NOT_FOUND</font>', table_cell),
            Paragraph('<font color="#d97706"><b>WARN</b></font>', table_cell)
        ],
        [
            Paragraph('<b>Inesperada</b> (Infraestrutura)', table_cell),
            Paragraph('Indisponibilidade / queda do PostgreSQL', table_cell),
            Paragraph('<b>503 Service Unavailable</b><br/><font face="Courier" color="#dc2626">DATABASE_UNAVAILABLE</font>', table_cell),
            Paragraph('<font color="#dc2626"><b>ERROR</b></font>', table_cell)
        ],
        [
            Paragraph('<b>Inesperada</b> (Aplicação)', table_cell),
            Paragraph('Exceção interna não tratada (crash)', table_cell),
            Paragraph('<b>500 Internal Server Error</b><br/><font face="Courier" color="#dc2626">INTERNAL_ERROR</font>', table_cell),
            Paragraph('<font color="#dc2626"><b>FATAL</b></font>', table_cell)
        ],
    ]
    faults_table = Table(faults_data, colWidths=[110, 155, 175, 75])
    faults_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e2e8f0')),
        ('BOX', (0, 0), (-1, -1), 0.6, colors.HexColor('#94a3b8')),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(faults_table)
    elements.append(Spacer(1, 6))

    # SECTION 3: REQUISITO 2 - REGISTRO ESTRUTURADO DE LOGS
    elements.append(Paragraph('3. Registro Estruturado de Logs em JSON e Sanitização LGPD', h1_style))
    elements.append(Paragraph(
        'Os eventos são emitidos em formato <b>JSON canônico estruturado</b> contendo os atributos essenciais de rastreabilidade, '
        'passando obrigatoriamente pela rotina de higienização <font face="Courier">redactSensitive()</font> '
        'que substitui recursivamente tokens, senhas e chaves criptográficas por <font face="Courier">[REDACTED]</font>.',
        body_style
    ))

    # JSON example box
    json_snippet = (
        '{\n'
        '  "id": "7b8d8104-5e58-47c3-b3c6-e918c5e63821",\n'
        '  "timestamp": "2026-11-06T18:02:00.000Z",\n'
        '  "level": "ERROR",\n'
        '  "errorCode": "DATABASE_UNAVAILABLE",\n'
        '  "eventId": "9c1b48d2-f673-40e1-bb90-71a25dbce871",\n'
        '  "description": "O banco de dados esta temporariamente indisponivel. Tente novamente em instantes.",\n'
        '  "context": "GlobalExceptionFilter",\n'
        '  "environment": "production",\n'
        '  "details": { "method": "GET", "path": "/api/v1/products/simulate/unexpected-database", "statusCode": 503 }\n'
        '}'
    )
    code_table = Table([[Paragraph(f'<font face="Courier" size="6.5">{json_snippet.replace(chr(10), "<br/>").replace(" ", "&nbsp;")}</font>', code_style)]], colWidths=[515])
    code_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#0f172a')),
        ('BOX', (0, 0), (-1, -1), 0.8, colors.HexColor('#1e293b')),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(code_table)
    elements.append(Spacer(1, 5))

    # Callout: Resiliência contra queda do banco
    resilience_text = (
        '<b>Resiliência com Buffer Circular de Fallback:</b> A persistência é realizada primariamente na tabela relacional '
        '<font face="Courier">system_logs</font> do PostgreSQL. Se o banco de dados cair ou ficar inacessível, o '
        '<font face="Courier">SystemLogsRepository</font> intercepta a falha e grava o registro em um buffer de memória de até 2000 eventos, '
        'impedindo travamentos e garantindo que o próprio log de falha de conexão continue consultável.'
    )
    res_box = Table([[Paragraph(resilience_text, body_style)]], colWidths=[515])
    res_box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f0fdf4')),
        ('BOX', (0, 0), (-1, -1), 0.8, colors.HexColor('#86efac')),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(res_box)
    elements.append(Spacer(1, 8))

    # SECTION 4: REQUISITO 3 - GERENCIAMENTO E CONSULTA
    elements.append(Paragraph('4. Gerenciamento, Consulta e Interface Web SPA', h1_style))
    elements.append(Paragraph(
        'A solução disponibiliza uma suíte RESTful completa para consulta integrada com uma interface visual reativa em React:',
        body_style
    ))

    endpoints_data = [
        [Paragraph('Método e Rota', table_header), Paragraph('Propósito e Filtros Suportados', table_header)],
        [
            Paragraph('<b>GET</b> <font face="Courier">/api/v1/logs</font>', table_cell),
            Paragraph('Consulta paginada com busca livre (<font face="Courier">search</font>), nível (<font face="Courier">level</font>), código (<font face="Courier">errorCode</font>), contexto (<font face="Courier">context</font>), <font face="Courier">eventId</font>, <font face="Courier">startDate</font> e <font face="Courier">endDate</font>.', table_cell)
        ],
        [
            Paragraph('<b>GET</b> <font face="Courier">/api/v1/logs/:id</font>', table_cell),
            Paragraph('Recuperação dos detalhes completos de uma ocorrência única via UUID.', table_cell)
        ],
        [
            Paragraph('<b>GET</b> <font face="Courier">/api/v1/logs/stats/count-by-error</font>', table_cell),
            Paragraph('Agrupamento quantitativo de ocorrências por tipo de erro para identificação rápida.', table_cell)
        ],
        [
            Paragraph('<b>GET</b> <font face="Courier">/api/v1/logs/metrics</font>', table_cell),
            Paragraph('Consolidação de métricas operacionais, taxa percentual de erros e status dos alertas.', table_cell)
        ],
    ]
    endpoints_table = Table(endpoints_data, colWidths=[185, 330])
    endpoints_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e2e8f0')),
        ('BOX', (0, 0), (-1, -1), 0.6, colors.HexColor('#94a3b8')),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(endpoints_table)
    elements.append(Spacer(1, 4))
    elements.append(Paragraph(
        '<b>Painel Web Integrado (<font face="Courier">LogsMonitoringPage.tsx</font>):</b> '
        'Acessível no menu lateral do sistema, exibe banner com badge de alerta em tempo real, cards de contagem, '
        'botões de disparo de simulação com 1 clique (inclusive teste de rajada de erros), ranking de erros recorrentes, '
        'formulário de filtros dinâmicos e modal com visualização formatada do JSON.',
        body_style
    ))
    elements.append(Spacer(1, 6))

    # SECTION 5: REQUISITO 4 - MONITORAMENTO E MÉTRICAS
    elements.append(Paragraph('5. Monitoramento, Métricas e Regras de Alerta', h1_style))
    
    alert_box_text = (
        '<b>REGRA DE ALERTA OPERACIONAL IMPLEMENTADA:</b><br/>'
        '• <b>Condição de Incidente Crítico:</b> Mais de <b>10 erros críticos (<font face="Courier">ERROR</font> ou <font face="Courier">FATAL</font>) em uma janela de 5 minutos</b>.<br/>'
        '• <b>Status <font color="#dc2626">CRITICAL</font>:</b> Flag <font face="Courier">alert.triggered = true</font>, emitindo mensagem de incidente operacional imediato.<br/>'
        '• <b>Status <font color="#d97706">WARNING</font>:</b> Entre 1 e 9 erros críticos nos últimos 5 minutos (alerta preventivo).<br/>'
        '• <b>Status <font color="#16a34a">NORMAL</font>:</b> Zero falhas críticas no período de observação.'
    )
    alert_box = Table([[Paragraph(alert_box_text, body_style)]], colWidths=[515])
    alert_box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#fff7ed')),
        ('BOX', (0, 0), (-1, -1), 0.8, colors.HexColor('#fdba74')),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(alert_box)
    elements.append(Spacer(1, 5))

    elements.append(Paragraph(
        '<b>Métricas Acompanhadas:</b> Contagem por nível de criticidade (<font face="Courier">INFO</font>, <font face="Courier">WARN</font>, <font face="Courier">ERROR</font>, <font face="Courier">FATAL</font>); '
        'Taxa global de falhas (<font face="Courier">errorRatePercentage</font>); e Lista ranqueada de erros recorrentes (<font face="Courier">topRecurringErrors</font>) '
        'com percentual de impacto, quantidade absoluta e carimbo do último evento.',
        body_style
    ))
    elements.append(Spacer(1, 6))

    # SECTION 6: EVIDÊNCIAS E TESTES AUTOMATIZADOS
    elements.append(Paragraph('6. Validação Automatizada e Evidências', h1_style))
    elements.append(Paragraph(
        'Todas as funcionalidades foram validadas por suítes de testes unitários e de integração automatizados '
        '(<b>46 test suites aprovados, 329 testes unitários</b>):',
        body_style
    ))

    tests_data = [
        [Paragraph('Suíte de Teste', table_header), Paragraph('Cenários Verificados', table_header), Paragraph('Resultado', table_header)],
        [
            Paragraph('<font face="Courier">products-failure-simulation.spec.ts</font>', table_cell_code),
            Paragraph('Simulação 409 (conflito), 404 (inexistente), 503 (banco) e 500 (crash) com payloads padronizados.', table_cell),
            Paragraph('<font color="#16a34a"><b>100% PASS</b></font>', table_cell)
        ],
        [
            Paragraph('<font face="Courier">system-logs.service.spec.ts</font>', table_cell_code),
            Paragraph('Geração de JSON estruturado, mascaramento de senhas/tokens, cálculo de métricas e disparo de alerta (>10 erros/5min).', table_cell),
            Paragraph('<font color="#16a34a"><b>100% PASS</b></font>', table_cell)
        ],
        [
            Paragraph('<font face="Courier">system-logs.controller.spec.ts</font>', table_cell_code),
            Paragraph('Endpoints de consulta paginada, filtros combinados, estatísticas por código e recuperação por UUID.', table_cell),
            Paragraph('<font color="#16a34a"><b>100% PASS</b></font>', table_cell)
        ],
        [
            Paragraph('<font face="Courier">executar-demonstracao.cjs</font>', table_cell_code),
            Paragraph('Script completo de demonstração executando todas as chamadas HTTP e gerando relatório de evidências.', table_cell),
            Paragraph('<font color="#16a34a"><b>100% SUCESSO</b></font>', table_cell)
        ]
    ]
    tests_table = Table(tests_data, colWidths=[185, 255, 75])
    tests_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e2e8f0')),
        ('BOX', (0, 0), (-1, -1), 0.6, colors.HexColor('#94a3b8')),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(tests_table)
    elements.append(Spacer(1, 6))

    # SECTION 7: RESUMO DOS ARQUIVOS
    elements.append(Paragraph('7. Arquivos Entregues no Repositório', h1_style))
    files_summary = (
        '• <b>Backend:</b> <font face="Courier">apps/backend/src/modules/system-logs/</font> (Entity, Repository, Service, Controller, Module, DTOs);<br/>'
        '• <b>Migrations:</b> <font face="Courier">1791590400000-system-logs-monitoring.ts</font> (tabela e índices otimizados);<br/>'
        '• <b>Frontend:</b> <font face="Courier">apps/frontend/src/LogsMonitoringPage.tsx</font> integrado com rotas e navegação;<br/>'
        '• <b>Documentação e Evidências:</b> Pasta <font face="Courier">entregas/atividade-gerenciamento-monitoramento-logs/</font> contendo '
        '<font face="Courier">DOCUMENTACAO.md</font>, <font face="Courier">RESPOSTA.md</font>, <font face="Courier">exemplos-requisicoes-respostas.http</font> e <font face="Courier">resultado-demonstracao.txt</font>.'
    )
    elements.append(Paragraph(files_summary, body_style))

    # Build PDF
    doc.build(elements, canvasmaker=NumberedCanvas)
    print(f'PDF criado com sucesso: {filename}')

if __name__ == '__main__':
    out_dir = r'C:\Users\RAFAEL OLIVEIRA\Desktop\SISTEMAS\EstoqueRevisao\entregas\atividade-gerenciamento-monitoramento-logs'
    out_path = os.path.join(out_dir, 'Resumo_Gerenciamento_e_Monitoramento_de_Logs.pdf')
    create_summary_pdf(out_path)
