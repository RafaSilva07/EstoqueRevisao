import os
import sys
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, Image
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
        self.drawRightString(555, 806, 'Experiência do Usuário (UX), Acessibilidade e Responsividade')

        # Bottom Footer
        self.line(40, 42, 555, 42)
        self.setFont('Helvetica', 7.5)
        self.drawString(40, 30, 'Relatório de Avaliação e Melhoria de Interface  |  Novembro 2026')
        page_text = f'Página {self._pageNumber} de {page_count}'
        self.drawRightString(555, 30, page_text)
        self.restoreState()

def create_ux_summary_pdf(filename, evidencias_dir):
    doc = SimpleDocTemplate(
        filename,
        pagesize=A4,
        leftMargin=40,
        rightMargin=40,
        topMargin=55,
        bottomMargin=55
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        'DocTitle',
        fontName='Helvetica-Bold',
        fontSize=16,
        leading=20,
        textColor=colors.HexColor('#0f172a'),
        spaceAfter=3
    )

    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        fontName='Helvetica',
        fontSize=9.5,
        leading=13,
        textColor=colors.HexColor('#0284c7'),
        spaceAfter=9
    )

    h1_style = ParagraphStyle(
        'Heading1Custom',
        fontName='Helvetica-Bold',
        fontSize=10.5,
        leading=13.5,
        textColor=colors.HexColor('#0f172a'),
        spaceBefore=7,
        spaceAfter=3,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'BodyCustom',
        fontName='Helvetica',
        fontSize=8,
        leading=10.8,
        textColor=colors.HexColor('#334155'),
        spaceAfter=3.5
    )

    table_header = ParagraphStyle(
        'TableHeader',
        fontName='Helvetica-Bold',
        fontSize=7.2,
        leading=9,
        textColor=colors.HexColor('#0f172a'),
        alignment=0
    )

    table_cell = ParagraphStyle(
        'TableCell',
        fontName='Helvetica',
        fontSize=7,
        leading=8.8,
        textColor=colors.HexColor('#334155'),
        alignment=0
    )

    table_cell_bold = ParagraphStyle(
        'TableCellBold',
        fontName='Helvetica-Bold',
        fontSize=7,
        leading=8.8,
        textColor=colors.HexColor('#0f172a'),
        alignment=0
    )

    elements = []

    # Title & Subtitle
    elements.append(Paragraph('Relatório de Experiência do Usuário, Acessibilidade e Responsividade', title_style))
    elements.append(Paragraph('Avaliação em Desktop vs. Celular, Correção de Layout no Formulário de Revisão e Personalização de Tema', subtitle_style))

    # Meta Info Box
    meta_data = [
        [
            Paragraph('<b>Projeto:</b> EstoqueRevisao — Fábrica de Software', body_style),
            Paragraph('<b>Funcionalidade Avaliada:</b> Revisão de Produtos e Personalização de Tema', body_style)
        ],
        [
            Paragraph('<b>Dispositivos Testados:</b> Desktop (1280px) e Celular / Mobile (320px–390px)', body_style),
            Paragraph('<b>Padrão de Conformidade:</b> <b>WCAG 2.1 — Nível AA (Acessibilidade)</b>', body_style)
        ]
    ]
    meta_table = Table(meta_data, colWidths=[255, 260])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f8fafc')),
        ('BOX', (0, 0), (-1, -1), 0.8, colors.HexColor('#cbd5e1')),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
    ]))
    elements.append(meta_table)
    elements.append(Spacer(1, 5))

    # SECTION 1: VISÃO GERAL E FUNCIONALIDADE
    elements.append(Paragraph('1. Funcionalidade Avaliada e Contexto Operacional', h1_style))
    elements.append(Paragraph(
        'A funcionalidade selecionada para avaliação e teste prático foi a <b>Revisão de Produtos</b> (<font face="Courier">ReviewPage</font> / fila PCP), '
        'utilizada por operadores do chão de fábrica para inspecionar itens recebidos, conferir lotes e datas de fabricação, e ratear '
        'quantidades físicas entre múltiplos destinos de estoque (<i>Lata Boa</i>, <i>Varejo</i>, <i>TUF</i> e <i>Descarte</i>). '
        'Foram realizados testes comparativos de usabilidade em telas de <b>computador (1280px)</b> e <b>celulares compactos (320px a 390px)</b>.',
        body_style
    ))

    # SECTION 2: ACESSIBILIDADE E PERSONALIZAÇÃO DE TEMA
    elements.append(Paragraph('2. Recursos de Acessibilidade e Personalização de Tema', h1_style))
    elements.append(Paragraph(
        '• <b>Personalização de Tema e Ajustes de Contraste:</b> Foi implementado o módulo de <b>Preferências Visuais</b> (<font face="Courier">PreferencesPage</font>), '
        'permitindo que o usuário alterne livremente entre <b>Tema Claro</b> e <b>Tema Escuro de Alto Contraste</b>, com persistência na conta do usuário no banco de dados. '
        'Isso garante legibilidade superior em ambientes industriais com pouca iluminação artificial ou reflexo solar na tela.<br/>'
        '• <b>Navegação por Teclado e Foco Visível:</b> Aplicação padronizada da pseudo-classe <font face="Courier">:focus-visible</font> com anel duplo de foco de 2px contrastante, '
        'além de atalho <i>"Pular para o conteúdo"</i> (<font face="Courier">skip-link</font>) para usuários que navegam sem mouse ou por leitores de tela.<br/>'
        '• <b>Rótulos Semânticos e Áreas de Toque:</b> Associação estrita de tags <font face="Courier">&lt;label&gt;</font> em todos os inputs e redimensionamento de botões '
        'para alvos de clique ergonômicos de no mínimo 44px de altura, atendendo às recomendações da <b>WCAG 2.1 AA</b>.',
        body_style
    ))

    # SECTION 3: PROBLEMAS IDENTIFICADOS
    elements.append(Paragraph('3. Identificação de Problemas (Usabilidade, Acessibilidade e Responsividade)', h1_style))

    problems_data = [
        [Paragraph('Problema Identificado', table_header), Paragraph('Classificação', table_header), Paragraph('Causa Técnica e Impacto no Usuário', table_header)],
        [
            Paragraph('<b>1. Quebra do Form no Celular</b>', table_cell_bold),
            Paragraph('<font color="#dc2626"><b>Responsividade Crítica</b></font>', table_cell),
            Paragraph('<b>A tela de revisão de produtos ficava totalmente quebrada no celular</b>. O formulário de adicionar produto e distribuição utilizava largura rígida e ficava limitado a meia largura do card mobile, gerando um <i>overflow</i> horizontal excessivo. Botões de confirmação e inputs ficavam cortados para fora da tela, inviabilizando o uso em smartphones.', table_cell)
        ],
        [
            Paragraph('<b>2. Contraste Insuficiente em Avisos</b>', table_cell_bold),
            Paragraph('<font color="#d97706"><b>Acessibilidade Visual</b></font>', table_cell),
            Paragraph('Mensagens de aviso e advertências herdavam cor de texto clara sobre fundos amarelos no tema escuro (taxa de contraste &lt; 2.5:1), violando a diretriz WCAG 1.4.3 e tornando as orientações operacionais ilegíveis.', table_cell)
        ],
        [
            Paragraph('<b>3. Alvos de Toque Diminutos e Foco Frágil</b>', table_cell_bold),
            Paragraph('<font color="#d97706"><b>Usabilidade Touch</b></font>', table_cell),
            Paragraph('Seletores e campos numéricos com altura inferior a 30px geravam cliques acidentais e erros frequentes de digitação durante a conferência física em aparelhos móveis com uma só mão.', table_cell)
        ],
    ]
    prob_table = Table(problems_data, colWidths=[115, 95, 305])
    prob_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e2e8f0')),
        ('BOX', (0, 0), (-1, -1), 0.6, colors.HexColor('#94a3b8')),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('TOPPADDING', (0, 0), (-1, -1), 2.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(prob_table)
    elements.append(Spacer(1, 5))

    # Callout: Destaque da Quebra Mobile
    callout_text = (
        '<b>DESTAQUE DA CORREÇÃO DE USABILIDADE MOBILE (Etapa 72):</b><br/>'
        'A etapa de revisão de produtos, que antes era <b>impossível de ser realizada em smartphones</b> devido ao estouro de layout '
        'e campos inatingíveis, foi totalmente reformulada: o formulário passou a ocupar <b>100% da largura útil</b> do card móvel, '
        'as colunas rígidas foram substituídas por uma matriz flexível com empilhamento vertical automático sem rolagem horizontal, '
        'e os botões receberam altura mínima ergonômica de 44px para toque confortável.'
    )
    callout_box = Table([[Paragraph(callout_callout := callout_text, body_style)]], colWidths=[515])
    callout_box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f0fdf4')),
        ('BOX', (0, 0), (-1, -1), 0.8, colors.HexColor('#86efac')),
        ('TOPPADDING', (0, 0), (-1, -1), 3.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
    ]))
    elements.append(callout_box)
    elements.append(Spacer(1, 6))

    # SECTION 4: MELHORIAS IMPLEMENTADAS
    elements.append(Paragraph('4. Melhorias Implementadas e Solução de Design', h1_style))
    elements.append(Paragraph(
        '• <b>Layout Flexível no Mobile:</b> Adoção de <font face="Courier">width: 100%</font> e <font face="Courier">flex-wrap: wrap</font> no formulário de adicionar produto, '
        'garantindo ajuste fluido em viewports compactos (320px–390px) sem qualquer barra de rolagem lateral.<br/>'
        '• <b>Preservação da Densidade no Desktop:</b> Em telas amplas (1280px+), o layout permanece em linhas compactas de alta densidade para operadores administrativos.<br/>'
        '• <b>Contraste nos Dois Temas:</b> Os avisos operacionais ganharam fundo escuro contrastante e texto amarelo-ouro nítido no tema escuro, '
        'alcançando taxa de contraste de <b>8.2:1</b>, preservando o contraste original no tema claro.',
        body_style
    ))
    elements.append(Spacer(1, 5))

    # SECTION 5: COMPARATIVO ANTES X DEPOIS E EVIDÊNCIAS
    elements.append(Paragraph('5. Comparativo Antes x Depois e Evidências Visuais', h1_style))

    comp_data = [
        [Paragraph('Aspecto de UX / Acessibilidade', table_header), Paragraph('Cenário Anterior (Problema)', table_header), Paragraph('Cenário Corrigido (Solução)', table_header)],
        [
            Paragraph('<b>Revisão no Celular (320px–390px)</b>', table_cell_bold),
            Paragraph('Tela quebrada no form de produto; colunas estourando o viewport horizontalmente; botões cortados e inatingíveis.', table_cell),
            Paragraph('Formulário responsivo em 100% da largura; campos empilhados sem rolagem lateral; botões amplos para toque (44px).', table_cell)
        ],
        [
            Paragraph('<b>Personalização de Tema</b>', table_cell_bold),
            Paragraph('Tema fixo sem opção de ajuste; avisos com baixo contraste (&lt; 2.5:1) ilegíveis em galpões escuros.', table_cell),
            Paragraph('Tela de Preferências com <b>Tema Claro</b> e <b>Tema Escuro</b> de alto contraste (&gt; 8:1) persistido no perfil.', table_cell)
        ],
        [
            Paragraph('<b>Navegação por Teclado e Foco</b>', table_cell_bold),
            Paragraph('Foco invisível em diversos navegadores; inputs diminutos (&lt; 30px) gerando cliques acidentais.', table_cell),
            Paragraph('Anel duplo de foco nítido (<font face="Courier">:focus-visible</font>) e atalho <i>"Pular para o conteúdo"</i>.', table_cell)
        ],
    ]
    comp_table = Table(comp_data, colWidths=[130, 185, 200])
    comp_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e2e8f0')),
        ('BOX', (0, 0), (-1, -1), 0.6, colors.HexColor('#94a3b8')),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('TOPPADDING', (0, 0), (-1, -1), 2.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(comp_table)
    elements.append(Spacer(1, 6))

    # Evidence Screenshots Table
    img1_path = os.path.join(evidencias_dir, 'revisao_mobile_claro.png')
    img2_path = os.path.join(evidencias_dir, 'revisao_mobile_escuro.png')
    img3_path = os.path.join(evidencias_dir, 'desktop_1280_escuro.png')

    if os.path.exists(img1_path) and os.path.exists(img2_path):
        img_table_data = [
            [
                Paragraph('<b>Evidência 1: Form Mobile Corrigido (Tema Claro)</b>', table_header),
                Paragraph('<b>Evidência 2: Form Mobile Corrigido (Tema Escuro)</b>', table_header)
            ],
            [
                Image(img1_path, width=125, height=135),
                Image(img2_path, width=125, height=135)
            ],
            [
                Paragraph('<font size="6" color="#64748b">Resolução 390px: matriz flexível ocupando 100% da largura, sem rolagem lateral.</font>', table_cell),
                Paragraph('<font size="6" color="#64748b">Resolução 390px: alto contraste e visibilidade ideal em ambientes escuros.</font>', table_cell)
            ]
        ]
        img_table = Table(img_table_data, colWidths=[255, 260])
        img_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f1f5f9')),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
            ('ALIGN', (0, 1), (-1, 1), 'CENTER'),
            ('VALIGN', (0, 1), (-1, 1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(img_table)
        elements.append(Spacer(1, 5))

    # SECTION 6: CONCLUSÃO
    elements.append(Paragraph('6. Conclusão', h1_style))
    elements.append(Paragraph(
        'A avaliação e as melhorias integradas no projeto EstoqueRevisao transformaram a experiência de uso. '
        'A correção do formulário de revisão de produtos viabilizou plenamente o uso do sistema em celulares e dispositivos portáteis no chão de fábrica, '
        'enquanto a personalização de tema e os reforços de acessibilidade asseguraram inclusão, conformidade técnica com a WCAG 2.1 AA '
        'e conforto visual para os operadores em qualquer condição de luminosidade.',
        body_style
    ))

    doc.build(elements, canvasmaker=NumberedCanvas)
    print(f'PDF de UX criado com sucesso: {filename}')

if __name__ == '__main__':
    base_dir = r'C:\Users\RAFAEL OLIVEIRA\Desktop\SISTEMAS\EstoqueRevisao\entregas\atividade-experiencia-usuario-acessibilidade-revisao'
    evid_dir = os.path.join(base_dir, 'evidencias')
    pdf_out = os.path.join(base_dir, 'Relatorio_Experiencia_Usuario_Acessibilidade_Revisao.pdf')
    create_ux_summary_pdf(pdf_out, evid_dir)
