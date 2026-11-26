/**
 * pages.js — 4 trang sinh biên bản (Gửi kho / Ủy thác / Điều chuyển / Trao đổi).
 * Mỗi trang gồm: bộ lọc phạm vi dữ liệu · form thông số · khung "kết quả tự tính" · nút Sinh biên bản.
 * Form được khai báo dạng dữ liệu (DOCS) nên thêm/bớt trường rất dễ.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const { $, $$, esc, toast, Loading, debounce, todayISO } = HAK.UI;
  const G = () => HAK.Generator;
  const fmtInt = (n) => G().fmtInt(n);

  /* ===============================================================
   * Bảng kê lâm sản (BKLS) — dùng chung cho các loại biên bản có xuất BKLS (xem BKLS_TYPES bên dưới).
   * autoBuyer: true → "Bên mua/nhận" có thể để trống, generateBkls() sẽ tự lấy theo công ty "Bên nhận" (nhanId) đã chọn.
   * hasReturned: true → loại này có "Chọn xe trả về" (extra:'returned') → hiện thêm ô "Nơi nhận hàng trả về" và
   *   generateBkls() sẽ tự tách riêng: BKLS chính (không tính xe trả về) + BKLS TRẢ VỀ (chiều ngược lại, số = Số BKLS + "-TV").
   * ============================================================= */
  /* v2.7.1 (Thủy 30/09/2026): nguồn gốc lâm sản mặc định mới. Form đã lưu còn đúng câu mặc định cũ → tự đổi sang câu mới (saved());
   * câu người dùng tự sửa thì giữ nguyên. Giữ đồng bộ với HAK.Bkls.DEFAULT_NGUON_GOC (bkls.js). */
  const NGUON_GOC_DEF = 'Dăm gỗ keo sản xuất từ nguyên liệu gỗ keo rừng trồng mua từ cá nhân và hộ gia đình';
  const NGUON_GOC_OLD =
    'Dăm gỗ keo sản xuất mua nguyên liệu gỗ keo rừng từ hộ gia đình và dăm gỗ keo mua từ Chi nhánh Công ty TNHH Hoàng Anh Khôi.';
  /* v2.7.6 (Thủy chọn phương án A): ô "Mã HS" ở tab BKLS thay chữ cố định "B11 3" trong mẫu BKLS. Mặc định theo hình thức:
   * Xuất khẩu / Ủy thác xuất khẩu = 4401220090 (v2.7.7 Thủy: đúng mã 10 số trên tờ khai, bản v2.7.6 ghi thiếu "00" → 4401.22.90);
   * hàng nội địa để trống (mục chỉ áp dụng XNK). Hồ sơ cũ trong Lưu trữ chưa có ô này → lấy mặc định của hình thức. In nguyên văn ô nhập, không tự định dạng. */
  const MA_HS_DEF = { xuatkhau: '4401220090', uythac: '4401220090', xuatkhogui: '4401220090' };
  const MA_HS_OLD = '4401.22.90'; // mặc định sai của v2.7.6 → form đã lưu còn đúng giá trị này thì tự đổi (saved())
  const maHsOf = (type, p) => {
    const v = p.bklsMaHs !== undefined ? String(p.bklsMaHs || '').trim() : MA_HS_DEF[type] || '';
    return v === MA_HS_OLD && MA_HS_DEF[type] ? MA_HS_DEF[type] : v; // hồ sơ lập bằng v2.7.6 (mặc định sai) → tạo lại BKLS ra mã đúng
  };
  function bklsGroup(autoBuyer, hasReturned, maHsDef) {
    const fields = [
      { id: 'bklsSoBkls', label: 'Số BKLS', type: 'text', ph: 'VD: 010/2026/BKLS', col: 4, help: true }, // help: gợi ý số kế tiếp (bklsHint)
      { id: 'bklsHeSo', label: 'Hệ số RMT → BDMT', type: 'text', def: '0.468', col: 3 },
      { id: 'bklsNgayLap', label: 'Ngày lập bảng kê', type: 'date', col: 3 },
      { id: 'bklsNgayLapXe', label: 'Bản từng xe: lấy ngày cân của từng xe', type: 'check', def: true, col: 2 },
      {
        id: 'bklsBenMuaTen',
        label: 'Tên bên mua / nhận chuyển giao',
        type: 'text',
        ph: autoBuyer ? 'Để trống = tự lấy theo "Bên nhận/Bên mua" đã chọn ở trên' : 'Bắt buộc nhập tay',
        col: 8,
      },
      { id: 'bklsBenMuaMst', label: 'Số GCN / MSDN / MST bên mua', type: 'text', col: 4 },
      { id: 'bklsBenMuaDc', label: 'Địa chỉ bên mua', type: 'text', col: 12 },
      { id: 'bklsBenMuaDt', label: 'Số điện thoại bên mua (không bắt buộc)', type: 'text', col: 6 },
      { id: 'bklsBenMuaEmail', label: 'Email bên mua (không bắt buộc)', type: 'text', col: 6 },
      { id: 'bklsNguonGoc', label: 'Nguồn gốc lâm sản (mục 7)', type: 'text', def: NGUON_GOC_DEF, col: 9 },
      {
        id: 'bklsMaHs',
        label: 'Mã HS (xuất / nhập khẩu)',
        type: 'text',
        def: maHsDef || '',
        ph: maHsDef ? '' : 'Hàng nội địa: để trống',
        col: 3,
      },
    ];
    if (hasReturned)
      fields.push({
        id: 'bklsTvNoiDen',
        label: 'BKLS TRẢ VỀ — Nơi nhận hàng trả về',
        type: 'text',
        ph: 'Để trống = tự lấy ngược lại nơi xuất kho ban đầu. Có xe trả về → tự tách riêng 1 bộ BKLS (số = Số BKLS + "-TV"), chủ lâm sản và bên mua/nhận đều là bên xuất (nhận lại hàng của chính mình).',
        col: 12,
      });
    fields.push(
      // v2.7.1 (Thủy chốt phương án A): bản tổng liệt kê từng BKLS con theo ngày ở mục 5 "Hồ sơ kèm theo" → bản tổng nhiều tờ
      {
        id: 'bklsListTrips',
        label: 'Bản tổng: liệt kê BKLS từng xe theo ngày ở mục 5 "Hồ sơ kèm theo" (bỏ tick = bản tổng gọn 1 trang)',
        type: 'check',
        def: true,
        col: 12,
      }
    );
    return { title: 'Bảng kê lâm sản (BKLS)', zone: 'bkls', fields };
  }
  /** Các loại biên bản có lập kèm BKLS (phải khớp HAK.CHUNGTU[*].bkls trong config.js) + có tự gợi ý "Bên mua" từ nhanId hay không. */
  const BKLS_TYPES = { xuatkhau: false, uythac: false, xuatkhogui: false, xuatban: true, traodoi: true };
  /** Các loại có "Chọn xe trả về" (extra:'returned') → BKLS tách riêng phần trả về. */
  const BKLS_HAS_RETURNED = { xuatkhau: true, uythac: true, xuatkhogui: true, xuatban: false, traodoi: false };
  /** v2.6.7 (Thủy chốt 28/09/2026): Xuất hàng kho gửi CHỈ lập biên bản — BKLS lập ở hình thức đích (Xuất khẩu / Ủy thác / Xuất bán) khi hàng chuyển chủ sở hữu.
   *  BKLS_TYPES vẫn giữ xuatkhogui để hồ sơ cũ trong Lưu trữ tạo lại được BKLS đã lập. */
  const PAGE_NO_BKLS = ['xuatkhogui'];
  const pageBkls = (type) => BKLS_TYPES[type] !== undefined && PAGE_NO_BKLS.indexOf(type) < 0;
  /** v2.6.7 — Chuyển hình thức: trang nguồn → các trang đích (xem convertTo). */
  const CONV_FROM = { xuatkhogui: ['xuatkhau', 'uythac', 'xuatban'] };

  /** v2.5 Phase 2 — ô "Chọn hợp đồng" (📇 Danh mục) cho các trang có hợp đồng theo tàu; key trang = key hình thức trong HAK.Catalog.TYPES. */
  const contractGroup = () => ({
    title: 'Hợp đồng (từ Danh mục)',
    zone: 'party',
    fields: [
      { id: 'contractId', label: 'Chọn dòng chi tiết hợp đồng — tàu, hàng hóa / TKHQ, số liệu thực hiện', type: 'contract', col: 12 },
    ],
  });

  /* ===============================================================
   * Khai báo form từng loại biên bản
   *   type: company | warehouse | text | date | check | select
   *   col : độ rộng cột Bootstrap (md)
   * ============================================================= */
  const DOCS = {
    guikho: {
      icon: '📄',
      title: 'Trung chuyển gửi kho',
      desc: 'Biên bản giao nhận hàng gửi kho + phụ lục bảng kê từng phiếu cân (STT, phiếu, giờ cân, biển số, cân 1/2, KL, ĐVVC).',
      groups: [
        {
          title: 'Các bên',
          zone: 'party',
          fields: [
            { id: 'giaoId', label: 'Bên giao (chủ hàng)', type: 'company', def: 'qn', col: 6 },
            { id: 'nhanId', label: 'Bên nhận (kho tiếp nhận)', type: 'company', def: 'hak', col: 6 },
          ],
        },
        {
          title: 'Kho gửi / kho nhận',
          zone: 'kho',
          fields: [
            { id: 'khoGiaoId', label: 'Kho gửi (xuất kho tại — bàn cân xuất)', type: 'warehouse', def: 'w_qc', col: 6 },
            { id: 'khoNhanId', label: 'Kho nhận (nhập kho tại)', type: 'warehouse', def: 'w_n_hak', col: 6 },
          ],
        },
        {
          title: 'Thông tin biên bản',
          zone: 'doc',
          fields: [
            {
              id: 'variant',
              label: 'Mẫu biên bản',
              type: 'select',
              def: 'dot',
              col: 12,
              options: [
                ['dot', 'Giao nhận theo đợt — phụ lục bảng kê từng phiếu cân'],
                ['thang', 'Xác nhận theo tháng — phụ lục tổng hợp theo biển số'],
              ],
            },
            { id: 'period', label: 'Đợt tháng (MM/YYYY)', type: 'text', ph: 'Tự động theo dữ liệu', col: 4 },
            { id: 'docDate', label: 'Ngày lập', type: 'date', col: 4, today: true },
            {
              id: 'evidence',
              label: 'Căn cứ chứng từ (mẫu theo tháng)',
              type: 'text',
              def: 'Phiếu xuất kho kiêm vận chuyển nội bộ (PXK) — trạng thái Đã phát hành',
              col: 12,
            },
            { id: 'showDetail', label: 'Kèm phụ lục 2: chi tiết từng phiếu cân (mẫu theo tháng)', type: 'check', col: 12 },
          ],
        },
      ],
      // Trung chuyển gửi kho: không lập BKLS (giống HAK.CHUNGTU.guikho.bkls = false)
    },
    xuatkhogui: {
      icon: '📦',
      title: 'Xuất hàng kho gửi',
      desc: 'Bảng xác nhận hàng gửi kho xuất khẩu theo từng tàu: khối lượng xuống cảng, trừ xe trả về, thực gửi/nhận + phụ lục phiếu cân.',
      groups: [
        {
          title: 'Tàu',
          zone: 'party',
          fields: [
            { id: 'ship', label: 'Tên tàu / chuyến', type: 'text', req: true, ph: 'VD: JR SOPHIA V.2501', col: 12 },
            { id: 'whLabel', label: 'Ghi vào cột "Kho xuất" ở phụ lục', type: 'whopt', attr: 'label', def: 'HAK Đà Nẵng', col: 6 },
            { id: 'khoGuiCode', label: 'Ký hiệu kho gửi', type: 'whopt', attr: 'code', def: 'HAKĐN', col: 6 },
          ],
        },
        {
          title: 'Các bên',
          zone: 'party',
          fields: [
            { id: 'giaoId', label: 'Bên gửi (chủ hàng)', type: 'company', def: 'qn', col: 6 },
            { id: 'nhanId', label: 'Bên nhận — đại diện kho gửi', type: 'company', def: 'hak', col: 6 },
          ],
        },
        {
          title: 'Kho',
          zone: 'kho',
          fields: [
            { id: 'khoGiaoId', label: 'Kho xuất (kho gửi)', type: 'warehouse', def: 'w_qc', col: 6 },
            { id: 'khoNhanId', label: 'Kho gởi đến', type: 'warehouse', def: 'w_dn', col: 6 },
          ],
        },
        {
          title: 'Thông tin biên bản',
          zone: 'doc',
          fields: [
            { id: 'period', label: 'Đợt tháng (MM/YYYY)', type: 'text', ph: 'Tự động', col: 4 },
            { id: 'docDate', label: 'Ngày lập', type: 'date', col: 4, today: true },
          ],
        },
        // v2.6.7: không lập BKLS ở trang này (xem PAGE_NO_BKLS)
      ],
      extra: 'returned',
    },
    xuatkhau: {
      icon: '📤',
      title: 'Xuất khẩu',
      desc: 'Bảng tổng hợp hàng xuất khẩu qua cân theo từng tàu (công ty tự xuất khẩu): tổng hợp theo ngày, xe trả về, thực xuất + phụ lục phiếu cân.',
      groups: [
        contractGroup(),
        {
          title: 'Tàu',
          zone: 'party',
          fields: [{ id: 'ship', label: 'Tên tàu / chuyến', type: 'text', req: true, ph: 'VD: JR SOPHIA V.2501', col: 12 }],
        },
        {
          title: 'Đơn vị xuất khẩu',
          zone: 'party',
          fields: [{ id: 'giaoId', label: 'Đơn vị xuất khẩu (chủ hàng)', type: 'company', def: 'hak', col: 12 }],
        },
        {
          title: 'Kho xuất / cảng',
          zone: 'kho',
          fields: [
            { id: 'khoGiaoId', label: 'Kho xuất (bàn cân)', type: 'warehouse', def: 'w_dn', col: 6 },
            { id: 'khoNhanId', label: 'Cảng / nơi nạp hàng lên tàu', type: 'warehouse', def: 'w_ts', col: 6 },
          ],
        },
        {
          title: 'Thông tin bảng tổng hợp',
          zone: 'doc',
          fields: [
            { id: 'period', label: 'Đợt tháng (MM/YYYY)', type: 'text', ph: 'Tự động', col: 4 },
            { id: 'docDate', label: 'Ngày lập', type: 'date', col: 4, today: true },
          ],
        },
        bklsGroup(BKLS_TYPES.xuatkhau, BKLS_HAS_RETURNED.xuatkhau, MA_HS_DEF.xuatkhau),
      ],
      extra: 'returned',
    },
    uythac: {
      icon: '🚢',
      title: 'Ủy thác xuất khẩu',
      desc: 'Biên bản giao nhận hàng hóa ủy thác xuất khẩu theo từng tàu + phụ lục toàn bộ phiếu cân + danh sách xe trả về.',
      groups: [
        contractGroup(),
        {
          title: 'Tàu',
          zone: 'party',
          fields: [
            { id: 'ship', label: 'Tên tàu / chuyến', type: 'text', req: true, ph: 'VD: HJ TIANHE V.2610', col: 6 },
            {
              id: 'wh',
              label: 'Kho xuất (điền cột "Kho xuất" ở phụ lục)',
              type: 'whopt',
              attr: 'label',
              ph: 'VD: Kho Thành phẩm Đại Hiệp',
              col: 6,
            },
          ],
        },
        {
          title: 'Các bên',
          zone: 'party',
          fields: [
            { id: 'giaoId', label: 'Bên ủy thác (chủ hàng)', type: 'company', def: 'dh', col: 6 },
            { id: 'nhanId', label: 'Bên nhận ủy thác (đứng tên xuất khẩu)', type: 'company', def: 'hak', col: 6 },
          ],
        },
        // v2.6.8: BKLS "Vận chuyển từ … đến …" lấy từ 2 ô này (trước đây trang Ủy thác không có → BKLS ghi cứng "Công ty TNHH Hoàng Anh Khôi" / "Cảng Tiên Sa")
        {
          title: 'Kho xuất / cảng',
          zone: 'kho',
          fields: [
            { id: 'khoGiaoId', label: 'Kho xuất (bàn cân) — "Vận chuyển từ" trên BKLS', type: 'warehouse', def: 'w_dh', col: 6 },
            { id: 'khoNhanId', label: 'Cảng / nơi nạp hàng — "Vận chuyển đến" trên BKLS', type: 'warehouse', def: 'w_ts', col: 6 },
          ],
        },
        {
          title: 'Hợp đồng ủy thác',
          zone: 'party',
          fields: [
            { id: 'contractNo', label: 'Số hợp đồng', type: 'text', ph: 'UTXK/ĐN-ĐH/0626', col: 5 },
            { id: 'contractDate', label: 'Ngày ký', type: 'date', col: 3 },
            { id: 'contractQty', label: 'KL tạm tính (BDMT)', type: 'text', ph: '6.500', col: 4, num: 'num' },
          ],
        },
        {
          title: 'Chứng thư giám định',
          zone: 'party',
          fields: [
            { id: 'certNo', label: 'Số chứng thư', type: 'text', ph: '26E04GPT00232-07', col: 6 },
            { id: 'certDate', label: 'Ngày chứng thư', type: 'date', col: 6 },
            { id: 'certWet', label: 'KL giám định — tấn tươi', type: 'text', ph: '13.010,81', col: 4, num: 'num' },
            { id: 'certDry', label: 'KL giám định — tấn khô', type: 'text', ph: 'Để trống = tự tính', col: 4, num: 'num' },
            { id: 'moisture', label: 'Độ ẩm (%)', type: 'text', ph: '49,9818', col: 4, num: 'dec' },
            {
              id: 'certReason',
              label: 'Lý do điều chỉnh số liệu chứng thư (chỉ khi KHÁC Danh mục)',
              type: 'text',
              ph: 'Vd: theo chứng thư bổ sung số …',
              col: 12,
            },
          ],
        },
        {
          title: 'Thông tin biên bản',
          zone: 'doc',
          fields: [
            { id: 'returnWh', label: 'Kho nhận xe trả về', type: 'text', def: 'Kho Hoàng Anh Khôi Đà Nẵng', col: 6 },
            { id: 'period', label: 'Đợt tháng (MM/YYYY)', type: 'text', ph: 'Tự động', col: 3 },
            { id: 'docDate', label: 'Ngày lập', type: 'date', col: 3, today: true },
          ],
        },
        bklsGroup(BKLS_TYPES.uythac, BKLS_HAS_RETURNED.uythac, MA_HS_DEF.uythac),
      ],
      extra: 'returned',
    },
    dieuchuyen: {
      icon: '🔄',
      title: 'Điều chuyển nội bộ',
      desc: 'Sinh đồng thời Quyết định điều chuyển và Biên bản giao nhận (Công ty ⇄ Chi nhánh).',
      groups: [
        {
          title: 'Chiều điều chuyển',
          zone: 'party',
          fields: [
            {
              id: 'direction',
              label: 'Chiều',
              type: 'select',
              def: 'cn2ct',
              col: 6,
              options: [
                ['cn2ct', 'Chi nhánh → Công ty (Kho Quế Sơn → Kho Đà Nẵng)'],
                ['ct2cn', 'Công ty → Chi nhánh'],
              ],
            },
            { id: 'issuerId', label: 'Đơn vị ban hành Quyết định', type: 'company', def: 'hak', col: 6 },
            { id: 'khoGiaoId', label: 'Kho đi', type: 'warehouse', def: 'w_qs', col: 6 },
            { id: 'khoNhanId', label: 'Kho đến (nhập kho tại)', type: 'warehouse', def: 'w_n_hak', col: 6 },
          ],
        },
        {
          title: 'Quyết định',
          zone: 'party',
          fields: [
            { id: 'qdNo', label: 'Số Quyết định', type: 'text', ph: '01/2026/ĐCXK', col: 4 },
            { id: 'qdDate', label: 'Ngày ký Quyết định', type: 'date', col: 4, today: true },
            { id: 'period', label: 'Đợt tháng (MM/YYYY)', type: 'text', ph: 'Tự động', col: 4 },
            { id: 'weightType', label: 'Kiểu cân ghi trong biên bản', type: 'text', def: 'Trung Chuyển', col: 6 },
            { id: 'zip', label: 'Đóng gói 2 file thành 1 tệp ZIP', type: 'check', col: 6 },
          ],
        },
      ],
      hidden: ['giaoId', 'nhanId'], // 2 bên tự suy ra từ chiều điều chuyển
      zoneLabels: { party: 'Quyết định & chiều' }, // v2.7.0 Thủy chốt: Chiều điều chuyển để tab 2, chung với Quyết định
    },
    traodoi: {
      icon: '🤝',
      title: 'Trao đổi hàng hóa',
      desc: 'Bảng chi tiết cân hàng — lô hàng trao đổi (STT, phiếu, xe, tài xế, khối lượng, đơn vị vận chuyển).',
      groups: [
        contractGroup(),
        {
          title: 'Các bên',
          zone: 'party',
          fields: [
            { id: 'giaoId', label: 'Đơn vị giao', type: 'company', def: 'qn', col: 6 },
            { id: 'nhanId', label: 'Đơn vị nhận', type: 'company', def: 'hak', col: 6 },
          ],
        },
        {
          title: 'Bàn cân / nơi giao hàng',
          zone: 'kho',
          fields: [
            { id: 'khoGiaoId', label: 'Bàn cân xuất', type: 'warehouse', def: 'w_qc', col: 6 },
            { id: 'khoNhanId', label: 'Nơi giao hàng', type: 'warehouse', def: 'w_ts', col: 6 },
          ],
        },
        {
          title: 'Hợp đồng & trình bày',
          zone: 'doc',
          fields: [
            { id: 'contractNo', label: 'Hợp đồng trao đổi số', type: 'text', ph: '01.26/HĐTĐ-HAK-QC', col: 6 },
            { id: 'period', label: 'Tháng (MM/YYYY)', type: 'text', ph: 'Tự động', col: 3 },
            { id: 'docDate', label: 'Ngày lập', type: 'date', col: 3, today: true },
            { id: 'defaultCarrier', label: 'Đơn vị vận chuyển mặc định (khi Excel không có cột này)', type: 'text', col: 8 },
            { id: 'renumber', label: 'Đánh số lại phiếu theo mẫu n/MMYYYY/TĐ', type: 'check', def: true, col: 4 },
          ],
        },
        bklsGroup(BKLS_TYPES.traodoi, BKLS_HAS_RETURNED.traodoi),
      ],
    },
    xuatban: {
      icon: '💰',
      title: 'Xuất bán',
      desc: 'Biên bản giao nhận hàng hóa — lô hàng xuất bán (bảng chi tiết cân hàng, hợp đồng mua bán, đơn giá / thành tiền bằng số và bằng chữ).',
      groups: [
        contractGroup(),
        {
          title: 'Các bên',
          zone: 'party',
          fields: [
            { id: 'giaoId', label: 'Bên bán', type: 'company', def: 'hak', col: 6 },
            { id: 'nhanId', label: 'Bên mua', type: 'company', def: 'dh', col: 6 },
          ],
        },
        {
          title: 'Bàn cân / nơi giao hàng',
          zone: 'kho',
          fields: [
            { id: 'khoGiaoId', label: 'Bàn cân xuất', type: 'warehouse', def: 'w_dn', col: 6 },
            { id: 'khoNhanId', label: 'Nơi giao hàng', type: 'warehouse', def: 'w_ts', col: 6 },
          ],
        },
        {
          title: 'Hợp đồng mua bán & giá',
          zone: 'doc',
          fields: [
            { id: 'contractNo', label: 'Hợp đồng mua bán số', type: 'text', ph: '01.26/HĐMB-HAK-ĐH', col: 6 },
            { id: 'period', label: 'Tháng (MM/YYYY)', type: 'text', ph: 'Tự động', col: 3 },
            { id: 'docDate', label: 'Ngày lập', type: 'date', col: 3, today: true },
            {
              id: 'unitPrice',
              label: 'Đơn giá (đồng/tấn)',
              type: 'text',
              ph: 'VD: 1.250.000 — để trống = không in giá',
              col: 6,
              num: 'num',
            },
            { id: 'priceNote', label: 'Ghi chú giá', type: 'text', ph: 'VD: chưa bao gồm thuế GTGT', col: 6 },
            { id: 'defaultCarrier', label: 'Đơn vị vận chuyển mặc định (khi Excel không có cột này)', type: 'text', col: 12 },
          ],
        },
        bklsGroup(BKLS_TYPES.xuatban, BKLS_HAS_RETURNED.xuatban),
      ],
      zoneLabels: { doc: 'Giá & biên bản' },
    },
  };

  /* Trạng thái riêng từng trang */
  const ST = {};
  Object.keys(DOCS).forEach((k) => {
    ST[k] = { filter: { groups: null, from: '', to: '' }, returned: new Set(), omit: new Map(), built: false, bklsDupKey: '' };
  });

  const cfg = () => HAK.Config.data;
  /** Dữ liệu Excel của đúng loại biên bản `type` (mỗi loại có file riêng — xem HAK.App.slots). */
  const getDs = (type) => {
    if (ST[type] && ST[type].savedDs) return ST[type].savedDs;
    const s = HAK.App && HAK.App.slots[type];
    return s && s.ds && s.ds.ok ? s.ds : null;
  };
  const fid = (type, id) => 'f-' + type + '-' + id;

  /* ===============================================================
   * Dựng HTML
   * ============================================================= */
  function companyOptions(sel) {
    return cfg()
      .companies.map(
        (c) =>
          '<option value="' +
          esc(c.id) +
          '"' +
          (c.id === sel ? ' selected' : '') +
          '>' +
          esc(c.short ? c.short + ' — ' + c.name : c.name) +
          '</option>'
      )
      .join('');
  }
  /** Dropdown kho: 2 nhóm "Xuất kho tại (địa chỉ)" / "Nhập kho tại" (theo type) + "Nhập tay…". `first` = nhóm đứng trước. */
  const WH_CUSTOM = '__custom';
  function whOptions(sel, first) {
    const isX = (w) => w.type === 'Kho xuất' || w.type === 'Kho gửi';
    const opt = (w) =>
      '<option value="' +
      esc(w.id) +
      '"' +
      (w.id === sel ? ' selected' : '') +
      '>' +
      esc(isX(w) && w.address ? w.name + ' — ' + w.address : w.name) +
      '</option>';
    const grp = (label, list) => (list.length ? '<optgroup label="' + label + '">' + list.map(opt).join('') + '</optgroup>' : '');
    const xs = cfg().warehouses.filter(isX),
      ns = cfg().warehouses.filter((w) => !isX(w));
    const gx = grp('Xuất kho tại (địa chỉ)', xs),
      gn = grp('Nhập kho tại', ns);
    return (
      (first === 'nhap' ? gn + gx : gx + gn) +
      '<option value="' +
      WH_CUSTOM +
      '"' +
      (sel === WH_CUSTOM ? ' selected' : '') +
      '>✎ Khác — nhập tay…</option>'
    );
  }
  /** Dropdown "ghi phụ lục" / "ký hiệu" lấy từ danh mục kho (Cài đặt → Kho). val không nằm trong danh sách → chọn "Khác — nhập tay…". */
  function whAttrList(attr) {
    const out = [];
    cfg().warehouses.forEach((w) => {
      const v = HAK.Config.whAttr(w, attr);
      if (v && out.indexOf(v) < 0) out.push(v);
    });
    return out;
  }
  function whAttrOptions(attr, val) {
    const list = whAttrList(attr);
    return (
      '<option value="">— Không điền —</option>' +
      list.map((v) => '<option value="' + esc(v) + '"' + (v === val ? ' selected' : '') + '>' + esc(v) + '</option>').join('') +
      '<option value="' +
      WH_CUSTOM +
      '"' +
      (val && list.indexOf(val) < 0 ? ' selected' : '') +
      '>✎ Khác — nhập tay…</option>'
    );
  }
  /** Giá trị thật của ô dropdown "whopt" (nếu chọn nhập tay thì lấy chữ trong ô nhập). */
  function whoptValue(sel) {
    if (sel.value !== WH_CUSTOM) return sel.value;
    const t = document.getElementById(sel.id + '__txt');
    return t ? t.value : '';
  }
  const whFirst = (id) => (/Nhan/.test(id) ? 'nhap' : 'xuat');
  function saved(type) {
    const sv = HAK.Store.get('hak.form.' + type, {}) || {};
    // BKLS bản PDF mặc định BẬT (như trang Chứng từ cũ). Form đã lưu từ bản trước (PDF đang tắt) → bật 1 lần duy nhất;
    // về sau người dùng tự tắt thì giữ đúng lựa chọn đó.
    const mig = 'hak.mig.bklsPdf.' + type;
    if (BKLS_TYPES[type] !== undefined && !HAK.Store.get(mig, false)) {
      sv.bklsTotalPdf = true;
      sv.bklsTripPdf = true;
      HAK.Store.set(mig, true);
    }
    if (String(sv.bklsNguonGoc || '').trim() === NGUON_GOC_OLD) sv.bklsNguonGoc = NGUON_GOC_DEF; // v2.7.1 câu mặc định cũ → mới
    if (String(sv.bklsMaHs || '').trim() === MA_HS_OLD && MA_HS_DEF[type]) sv.bklsMaHs = MA_HS_DEF[type]; // v2.7.7 mã HS thiếu "00" → đủ 10 số
    return sv;
  }

  function fieldHtml(type, f, sv) {
    const id = fid(type, f.id);
    const val = sv[f.id] !== undefined ? sv[f.id] : f.def !== undefined ? f.def : '';
    const lbl = '<label class="form-label' + (f.req ? ' req' : '') + '" for="' + id + '">' + esc(f.label) + '</label>';
    let ctl = '';
    if (f.type === 'company') ctl = '<select class="form-select" id="' + id + '" data-kind="company">' + companyOptions(val) + '</select>';
    else if (f.type === 'warehouse')
      ctl =
        '<select class="form-select" id="' +
        id +
        '" data-kind="warehouse">' +
        whOptions(val, whFirst(f.id)) +
        '</select>' +
        '<div class="wh-custom mt-2' +
        (val === WH_CUSTOM ? '' : ' d-none') +
        '" id="' +
        id +
        '-custom">' +
        '<input type="text" class="form-control mb-1" id="' +
        id +
        '__name" placeholder="Tên kho / nơi nhập, xuất" value="' +
        esc(sv[f.id + '__name'] || '') +
        '" autocomplete="off">' +
        '<input type="text" class="form-control" id="' +
        id +
        '__addr" placeholder="Địa chỉ (không bắt buộc)" value="' +
        esc(sv[f.id + '__addr'] || '') +
        '" autocomplete="off"></div>';
    else if (f.type === 'whopt') {
      const custom = val && whAttrList(f.attr).indexOf(val) < 0;
      ctl =
        '<select class="form-select" id="' +
        id +
        '" data-kind="whopt" data-attr="' +
        f.attr +
        '">' +
        whAttrOptions(f.attr, val) +
        '</select>' +
        '<input type="text" class="form-control mt-2' +
        (custom ? '' : ' d-none') +
        '" id="' +
        id +
        '__txt" placeholder="' +
        esc(f.ph || 'Nhập tay') +
        '" value="' +
        esc(custom ? val : '') +
        '" autocomplete="off">';
    } else if (f.type === 'contract')
      ctl =
        '<div class="d-flex flex-wrap gap-2 align-items-center mb-1">' +
        '  <input type="text" class="form-control form-control-sm ct-search-box" style="width: 220px;" placeholder="🔍 Lọc nhanh HĐ, tàu, khách…" data-search-target="' +
        id +
        '">' +
        '  <select class="form-select" style="flex:1 1 16rem;min-width:0;max-width:100%" id="' +
        id +
        '" data-kind="contract">' +
        contractOptions(type, val) +
        '  </select>' +
        '  <button class="btn btn-outline-primary btn-sm" type="button" data-ct-act="refill" title="Điền lại các ô từ hợp đồng đang chọn">↻ Điền lại</button>' +
        '  <a class="btn btn-outline-secondary btn-sm" href="#/catalog" title="Mở Danh mục hợp đồng & khách hàng">📇 Danh mục</a>' +
        '</div>' +
        '<div class="mt-2" id="ctMsg-' +
        type +
        '"></div>';
    else if (f.type === 'select')
      ctl =
        '<select class="form-select" id="' +
        id +
        '">' +
        f.options
          .map((o) => '<option value="' + esc(o[0]) + '"' + (o[0] === val ? ' selected' : '') + '>' + esc(o[1]) + '</option>')
          .join('') +
        '</select>';
    else if (f.type === 'date')
      ctl = '<input type="date" class="form-control" id="' + id + '" value="' + esc(f.today ? todayISO() : '') + '">';
    else if (f.type === 'check')
      return (
        '<div class="col-md-' +
        f.col +
        '"><div class="form-check mt-2"><input class="form-check-input" type="checkbox" id="' +
        id +
        '"' +
        (val ? ' checked' : '') +
        '><label class="form-check-label" for="' +
        id +
        '">' +
        esc(f.label) +
        '</label></div></div>'
      );
    else
      ctl =
        '<input type="text" class="form-control" id="' +
        id +
        '"' +
        (f.num ? ' data-numfmt="' + f.num + '" inputmode="decimal"' : '') +
        ' value="' +
        esc(f.num && HAK.NumFmt && HAK.NumFmt.parse(val, f.num) !== null ? HAK.NumFmt.txt(HAK.NumFmt.parse(val, f.num), f.num) : val) +
        '" placeholder="' +
        esc(f.ph || '') +
        '" autocomplete="off">';
    if (f.help) ctl += '<div class="form-text" id="' + id + '-help"></div>'; // chỗ hiển thị gợi ý động (vd. số BKLS kế tiếp)
    return '<div class="col-md-' + f.col + '">' + lbl + ctl + '</div>';
  }

  /**
   * v2.6.2: công ty làm việc (HAK.Auth.company) = bên xuất MẶC ĐỊNH mỗi lần mở app (vẫn đổi được trên trang).
   * Đổi bên xuất thì kho xuất / bàn cân lấy theo kho xuất mặc định của công ty (Cài đặt → Công ty). Điều chuyển tự suy bên theo chiều → bỏ qua.
   */
  function companyDefaults(type, sv) {
    const co = HAK.Auth && HAK.Auth.company ? HAK.Auth.company() : '';
    if (!co || (DOCS[type].hidden || []).indexOf('giaoId') >= 0 || !fieldDef(type, 'giaoId') || sv.giaoId === co) return sv;
    sv.giaoId = co;
    const c = cfg().companies.find((x) => x.id === co),
      kx = c ? HAK.Config.companyAttr(c, 'khoXuat') : '';
    if (kx && fieldDef(type, 'khoGiaoId') && cfg().warehouses.some((w) => w.id === kx)) sv.khoGiaoId = kx;
    return sv;
  }
  /** v2.7.0 biểu tượng nét mảnh (HAK.Icons); chưa có → dùng emoji cũ. */
  const ico = (name, emoji) => (HAK.Icons && HAK.Icons.has(name) ? HAK.Icons.svg(name) + ' ' : emoji + ' ');
  function buildPage(type) {
    const D = DOCS[type],
      sv = companyDefaults(type, saved(type));
    const sec = $('#page-' + type);
    const groupHtml = (g) => {
      const fields = g.fields.filter((f) => !(D.hidden || []).includes(f.id));
      if (!fields.length) return '';
      return (
        '<div class="card mb-3"><div class="card-body"><div class="sec-title">' +
        esc(g.title) +
        '</div><div class="row g-3">' +
        fields.map((f) => fieldHtml(type, f, sv)).join('') +
        '</div></div></div>'
      );
    };
    const extra =
      D.extra === 'returned'
        ? '<div class="card mb-3"><div class="card-body"><div class="sec-title">Xe trả về (không lên được tàu)</div>' +
          '<div class="d-flex flex-wrap align-items-center gap-2"><button class="btn btn-outline-primary" id="btnReturn-' +
          type +
          '" type="button">' +
          ico('truck', '🚛') +
          'Chọn xe trả về</button>' +
          '<span id="retSummary-' +
          type +
          '" class="muted">Chưa chọn — mặc định "Không có xe trả về".</span></div>' +
          '<div class="form-text">Khối lượng thực giao = khối lượng qua cân − khối lượng xe trả về. Bảng phụ lục "xe trả về" chỉ xuất hiện khi có chọn xe.</div></div></div>'
        : '';
    // ---- bộ lọc ----
    const filterHtml =
      '<div class="card mb-3"><div class="card-body"><div class="sec-title">Phạm vi lập chứng từ <span class="muted fw-normal small">— tập phiếu dùng để lập biên bản / BKLS / Excel (lọc ở đây chính là phạm vi sẽ lập; khác với "Lọc xem trước" ở Nhập liệu và "Kỳ báo cáo" ở Báo cáo)</span></div>' +
      '<div id="smart-' +
      type +
      '"></div>' +
      '<div id="chips-' +
      type +
      '" class="d-none"></div><div id="zeroWhy-' +
      type +
      '" class="alert alert-warning py-1 small mt-2 mb-0 d-none" role="status"></div>' +
      '<div class="row g-2 align-items-end d-none"><div class="col-6 col-md-4"><label class="form-label">Từ ngày</label><input type="date" class="form-control" id="from-' +
      type +
      '"></div>' +
      '<div class="col-6 col-md-4"><label class="form-label">Đến ngày</label><input type="date" class="form-control" id="to-' +
      type +
      '"></div>' +
      '<div class="col-12 col-md-4 d-grid"><button class="btn btn-outline-secondary" id="resetFlt-' +
      type +
      '" type="button">Đặt lại bộ lọc</button></div></div>' +
      '<div class="form-text">Bỏ trống ngày = lấy toàn bộ dữ liệu trong file Excel.</div>' +
      '<div class="border rounded p-2 mt-2"><div class="small fw-semibold mb-1">🚢 Tách phiếu cân trong cùng ngày <span class="muted fw-normal">— 1 ngày chạy 2 tàu: mỗi tàu một hồ sơ, lọc theo GIỜ cân hoặc dãy SỐ PHIẾU của tàu đó</span></div>' +
      '<div class="row g-2 align-items-end"><div class="col-6 col-md-3"><label class="form-label small mb-0" for="tf-' +
      type +
      '">Giờ cân từ</label><input type="time" class="form-control form-control-sm" id="tf-' +
      type +
      '"></div>' +
      '<div class="col-6 col-md-3"><label class="form-label small mb-0" for="tt-' +
      type +
      '">Giờ cân đến</label><input type="time" class="form-control form-control-sm" id="tt-' +
      type +
      '"></div>' +
      '<div class="col-6 col-md-3"><label class="form-label small mb-0" for="kf-' +
      type +
      '">Số phiếu từ</label><input type="text" class="form-control form-control-sm" id="kf-' +
      type +
      '" inputmode="numeric" autocomplete="off"></div>' +
      '<div class="col-6 col-md-3"><label class="form-label small mb-0" for="kt-' +
      type +
      '">Số phiếu đến</label><input type="text" class="form-control form-control-sm" id="kt-' +
      type +
      '" inputmode="numeric" autocomplete="off"></div></div>' +
      '<div class="form-text mt-1" id="splitNote-' +
      type +
      '">Để trống = không tách. Ca qua nửa đêm: giờ từ lớn hơn giờ đến (vd 22:00 → 02:00). Số phiếu so theo dãy số cuối (PC-000123 → 123).</div></div>' +
      '<div class="d-flex flex-wrap align-items-center gap-2 mt-2"><button class="btn btn-outline-danger btn-sm" id="btnOmit-' +
      type +
      '" type="button">🚫 Bỏ phiếu cân…</button><span id="omitSummary-' +
      type +
      '" class="muted small">Chưa bỏ phiếu nào.</span></div>' +
      '<div class="d-flex flex-wrap align-items-center gap-2 mt-2"><button class="btn btn-outline-success btn-sm" id="btnPick-' +
      type +
      '" type="button">✅ Chọn phiếu cân của tàu này…</button><span id="pickSummary-' +
      type +
      '" class="muted small">Chưa chọn riêng — lấy theo phạm vi ở trên.</span></div>' +
      '<div class="form-text">2 tàu cân xen kẽ trong ngày: tick đúng các phiếu của tàu này (hoặc dán danh sách số phiếu); hồ sơ chỉ gồm các phiếu đã chọn. Tàu kia lập hồ sơ riêng với các phiếu còn lại.</div>' +
      '<div class="form-text">Phiếu bị bỏ coi như không có: không tính vào tổng, biên bản, BKLS, báo cáo. Có thể khôi phục bất cứ lúc nào trước khi lưu hồ sơ.</div><div id="convNote-' +
      type +
      '"></div></div></div>';
    // ---- v2.7.0: chia vùng nhập liệu thành tab (vùng không có nhóm nào thì bỏ tab) ----
    const zones = ZONES.map(([z, lb]) => ({
      z,
      lb: (D.zoneLabels || {})[z] || lb,
      html:
        z === 'data'
          ? filterHtml + extra
          : D.groups
              .filter((g) => g.zone === z)
              .map(groupHtml)
              .join(''),
    })).filter((x) => x.html);
    const navHtml =
      '<div class="zone-nav" id="zones-' +
      type +
      '" role="tablist">' +
      zones
        .map(
          (x, i) =>
            '<button type="button" class="zone-tab" role="tab" data-zone="' +
            x.z +
            '"><span class="zl"><b>' +
            (i + 1) +
            '</b><span>' +
            esc(x.lb) +
            '</span></span><span class="zs"></span></button>'
        )
        .join('') +
      '</div>';
    const panesHtml = zones
      .map(
        (x, i) =>
          '<div class="zone-pane" role="tabpanel" data-zone="' +
          x.z +
          '" hidden>' +
          x.html +
          '<div class="zone-foot">' +
          (i
            ? '<button class="btn btn-sm btn-outline-secondary" type="button" data-zone-go="' + zones[i - 1].z + '">‹ Quay lại</button>'
            : '<span></span>') +
          (i < zones.length - 1
            ? '<button class="btn btn-sm btn-primary" type="button" data-zone-go="' +
              zones[i + 1].z +
              '">Tiếp: ' +
              esc(zones[i + 1].lb) +
              ' ›</button>'
            : '<span class="small muted text-end">Đủ thông tin → bấm <b>Tạo biên bản</b> ở khung Kết quả.</span>') +
          '</div></div>'
      )
      .join('');

    const typeNavTabs =
      '<div class="doc-type-nav-tabs d-flex flex-wrap gap-1 p-1 bg-body-secondary rounded mb-3">' +
      Object.keys(DOCS)
        .map(
          (k) =>
            '<a href="#/' +
            k +
            '" class="btn btn-sm ' +
            (k === type ? 'btn-primary active fw-semibold shadow-sm' : 'btn-light border-0 text-secondary') +
            '">' +
            DOCS[k].icon +
            ' ' +
            esc(DOCS[k].title) +
            '</a>'
        )
        .join('') +
      '</div>';

    sec.innerHTML =
      typeNavTabs +
      '<div class="d-flex align-items-start gap-3 mb-3"><div class="fs-1 page-ico">' +
      (HAK.Icons && HAK.Icons.has(type) ? HAK.Icons.svg(type) : D.icon) +
      '</div><div><h4 class="mb-1">' +
      esc(D.title) +
      '</h4><div class="muted">' +
      esc(D.desc) +
      '</div></div></div>' +
      '<div id="ctxBar-' +
      type +
      '" class="border rounded p-2 small mb-3 bg-body-tertiary" role="status" aria-live="polite"></div>' +
      '<div id="noData-' +
      type +
      '" class="alert alert-warning d-none">Chưa có dữ liệu Excel cho loại biên bản này. <a href="#/file" class="alert-link" data-filetype="' +
      type +
      '">Nhập liệu cho loại này</a> để bắt đầu.</div>' +
      navHtml +
      '<div class="row g-3"><div class="col-xl-8">' +
      '<div class="card zone-body">' +
      panesHtml +
      '</div>' +
      '</div><div class="col-xl-4"><div class="sticky-side">' +
      '<div class="card mb-3"><div class="card-header">' +
      ico('calc', '🧮') +
      'Kết quả tự tính</div><div class="card-body">' +
      '<div class="row text-center mb-3"><div class="col-6"><div class="sum-big" id="sumTrips-' +
      type +
      '">0</div><div class="muted small">xe (phiếu cân)</div></div>' +
      '<div class="col-6"><div class="sum-big" id="sumTons-' +
      type +
      '">0</div><div class="muted small">tấn</div></div></div>' +
      '<ul class="sum-list" id="sumList-' +
      type +
      '"></ul></div></div>' +
      '<div id="msgs-' +
      type +
      '" class="mb-3"></div>' +
      '<div class="d-flex gap-2 mb-2"><button type="button" class="btn btn-outline-primary" data-year-save>Lưu hồ sơ</button><button type="button" class="btn btn-outline-secondary" data-year-new>Thêm mới</button><button type="button" class="btn btn-outline-secondary" data-year-list>Xem năm cũ</button></div><div class="small muted mb-2" id="year-note-' +
      type +
      '"></div>' +
      '<div class="d-grid gap-2 mb-2"><button class="btn btn-success btn-lg fw-bold shadow-sm" id="btnQuickPackage-' +
      type +
      '" type="button">⚡ Xuất trọn bộ hồ sơ (1-Click)</button></div>' +
      '<div class="d-grid gap-2"><button class="btn btn-primary btn-lg" id="gen-' +
      type +
      '" type="button">' +
      ico('word', '⚡') +
      'Tạo biên bản (Word)</button>' +
      '<div class="row g-2"><div class="col-6 d-grid"><button class="btn btn-outline-primary" id="pdf-' +
      type +
      '" type="button">' +
      ico('printer', '🖨️') +
      'Tải PDF</button></div>' +
      '<div class="col-6 d-grid"><button class="btn btn-outline-success" id="xls-' +
      type +
      '" type="button" title="Bảng cân chi tiết (Excel) để lưu trữ">' +
      ico('sheet', '📊') +
      'Xuất Excel</button></div></div>' +
      (pageBkls(type)
        ? '<button class="btn btn-outline-dark" id="bkls-' + type + '" type="button">' + ico('bkls', '🧾') + 'Tạo BKLS…</button>'
        : '') +
      '</div>' +
      '<div class="form-text text-center mt-2" id="genHint-' +
      type +
      '"></div>' +
      (CONV_FROM[type]
        ? '<div class="border-top mt-3 pt-3"><div class="fw-semibold mb-1">' +
          ico('convert', '➡') +
          'Chuyển sang hình thức khác</div>' +
          '<div class="small muted mb-2">Hàng xuất ở kho gửi để bán / xuất khẩu / ủy thác: chép phiếu cân (đúng phạm vi đang lọc, tàu, xe trả về, bên gửi, kho xuất) sang trang đích để lập thêm biên bản và <b>BKLS</b> (khi hàng chuyển chủ sở hữu). Mỗi đợt chỉ 1 hình thức.</div>' +
          '<div class="d-flex flex-wrap gap-2">' +
          CONV_FROM[type]
            .map(
              (t) =>
                '<button class="btn btn-sm btn-outline-primary" type="button" data-conv="' +
                t +
                '">' +
                DOCS[t].icon +
                ' ' +
                esc(DOCS[t].title) +
                '</button>'
            )
            .join('') +
          '</div>' +
          '<div class="small mt-2" id="convState-' +
          type +
          '"></div></div>'
        : '') +
      '</div></div></div>';

    bind(type);
    ST[type].built = true;
    showZone(type, zoneSaved()[type]);
  }

  /* ===============================================================
   * v2.7.0 Phân vùng nhập liệu theo tab (Thủy chốt 29/09/2026) — cùng thứ tự ở mọi trang biên bản.
   * Các ô ở tab ẩn vẫn nằm trong trang (chỉ hidden) → collect() / tạo biên bản / BKLS không đổi.
   * ============================================================= */
  const ZONES = [
    ['data', 'Dữ liệu cân'],
    ['party', 'Hợp đồng & bên'],
    ['kho', 'Kho & cảng'],
    ['doc', 'Biên bản'],
    ['bkls', 'BKLS'],
  ];
  const ZONE_KEY = 'hakui.zone'; // tab đang mở của từng trang — chỉ là tiện lợi trên máy này (không mang tiền tố 'hak.' → không vào sao lưu)
  function zoneSaved() {
    try {
      return JSON.parse(root.localStorage.getItem(ZONE_KEY) || '{}') || {};
    } catch (e) {
      return {};
    }
  }
  function showZone(type, z) {
    const nav = $('#zones-' + type);
    if (!nav) return;
    const tabs = $$('.zone-tab', nav);
    if (!tabs.some((b) => b.dataset.zone === z)) z = tabs[0].dataset.zone;
    tabs.forEach((b) => {
      const on = b.dataset.zone === z;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $$('#page-' + type + ' .zone-pane').forEach((p) => {
      p.hidden = p.dataset.zone !== z;
    });
    ST[type].zone = z;
    try {
      const m = zoneSaved();
      m[type] = z;
      root.localStorage.setItem(ZONE_KEY, JSON.stringify(m));
    } catch (e) {
      /* bị chặn → chỉ không nhớ tab */
    }
  }
  /** Ô còn thiếu theo từng vùng — đúng các điều kiện mà generate() (generator: tên tàu) / generateBkls() (bklsMissing) kiểm tra. rows = phiếu trong phạm vi (null = chưa có dữ liệu). */
  function zoneIssues(type, rows) {
    const out = {},
      add = (z, id, label) => {
        (out[z] = out[z] || []).push({ id, label });
      };
    if (!rows) add('data', null, 'Chưa có dữ liệu Excel');
    else if (!rows.length) add('data', null, 'Không có phiếu cân nào trong phạm vi đang lọc');
    const p = collect(type),
      ship = fieldDef(type, 'ship');
    if (ship && ship.req && !String(p.ship || '').trim()) add(zoneOfField(type, 'ship'), 'ship', ship.label);
    if (pageBkls(type)) bklsMissing(type, p, !!(rows && rows.length)).m.forEach((x) => add('bkls', x.id, x.label));
    return out;
  }
  const zoneOfField = (type, id) => {
    const g = DOCS[type].groups.find((x) => x.fields.some((f) => f.id === id));
    return g ? g.zone : 'data';
  };
  function renderZones(type, rows) {
    const nav = $('#zones-' + type);
    if (!nav) return;
    const iss = zoneIssues(type, rows);
    $$('.zone-tab', nav).forEach((b) => {
      const z = b.dataset.zone,
        n = (iss[z] || []).length,
        s = b.querySelector('.zs');
      s.className = 'zs ' + (!n ? 'ok' : z === 'bkls' ? 'warn' : 'bad'); // BKLS: nhắc (vàng) — chỉ bắt buộc khi bấm Tạo BKLS
      s.textContent = n ? String(n) : '✓';
      b.title = n ? 'Còn thiếu: ' + iss[z].map((x) => x.label).join('; ') : 'Đã đủ các ô bắt buộc';
    });
  }
  /** Mở đúng tab chứa ô `id` (null = bộ lọc ngày), tô đỏ ô đó tới khi sửa. */
  function focusField(type, id) {
    const el = id ? $('#' + fid(type, id)) : $('#from-' + type);
    if (!el) return;
    const pane = el.closest('.zone-pane');
    if (pane) showZone(type, pane.dataset.zone);
    if (id) {
      const off = () => el.classList.remove('is-invalid');
      el.classList.add('is-invalid');
      el.addEventListener('input', off, { once: true });
      el.addEventListener('change', off, { once: true });
    }
    try {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch (e) {
      /* bỏ qua */
    }
  }
  const ERR_FIELD = [
    [/tên tàu/i, 'ship'],
    [/Độ ẩm/, 'moisture'],
    [/Tấn khô/, 'certDry'],
    [/Đơn giá/, 'unitPrice'],
    [/phiếu cân nào/, null],
  ];
  function focusError(type, msg) {
    const hit = ERR_FIELD.find((e) => e[0].test(msg));
    if (hit && (hit[1] === null || fieldDef(type, hit[1]))) focusField(type, hit[1]);
  }

  /* ===============================================================
   * Gắn sự kiện
   * ============================================================= */
  function bind(type) {
    const sec = $('#page-' + type);
    if (HAK.NumFmt) HAK.NumFmt.attach(sec); // ô số: tự thêm dấu . hàng nghìn khi rời ô
    const save = debounce(() => saveForm(type), 300);
    window.addEventListener('hak:flush', () => saveForm(type));
    const upd = debounce(() => updateSummary(type), 120);
    sec.addEventListener('input', (e) => {
      if (e.target.closest('.card-body') && e.target.id && e.target.id.indexOf('f-') === 0) {
        save();
        upd();
      }
    });
    sec.addEventListener('click', async (e) => {
      try {
        if (e.target.hasAttribute('data-year-save')) {
          e.target.disabled = true;
          if (!(await confirmPickConflicts(type))) return;
          await HAK.Yearbook.saveAsk(type);
          markClean(type);
          $('#year-note-' + type).textContent = 'Đã lưu năm ' + HAK.Yearbook.year;
        }
        if (e.target.hasAttribute('data-year-list')) await HAK.Yearbook.show();
        if (e.target.hasAttribute('data-year-new')) {
          await newRecord(type);
        }
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        if (e.target.hasAttribute('data-year-save')) e.target.disabled = false;
      }
    });
    sec.addEventListener('change', (e) => {
      if (e.target.id === fid(type, 'direction')) applyDirection(type);
      if (e.target.dataset && e.target.dataset.kind === 'warehouse') toggleCustomWh(e.target);
      if (e.target.dataset && e.target.dataset.kind === 'whopt') toggleCustomTxt(e.target);
      if (e.target.dataset && e.target.dataset.kind === 'contract') {
        applyContract(type);
        return;
      }
      if (e.target.id && e.target.id.indexOf('f-') === 0) {
        save();
        upd();
      }
    });
    sec.addEventListener('click', (e) => {
      // ↻ Điền lại · Dùng số liệu hợp đồng · Giữ như đang nhập
      const b = e.target.closest('[data-ct-act]');
      if (!b) return;
      const act = b.dataset.ctAct;
      if (act === 'refill') {
        if (!selectedContract(type)) {
          toast('Chưa chọn hợp đồng.', 'warning');
          return;
        }
        applyContract(type);
      } else resolveConflicts(type, act === 'over');
    });
    $('#from-' + type).addEventListener('change', (e) => {
      ST[type].filter.from = e.target.value;
      updateSummary(type);
    });
    $('#to-' + type).addEventListener('change', (e) => {
      ST[type].filter.to = e.target.value;
      updateSummary(type);
    });
    [
      ['tf', 'timeFrom'],
      ['tt', 'timeTo'],
      ['kf', 'ticketFrom'],
      ['kt', 'ticketTo'],
    ].forEach(([pre, key]) => {
      const el = $('#' + pre + '-' + type);
      if (el)
        el.addEventListener('input', (e) => {
          ST[type].filter[key] = e.target.value.trim();
          updateSummary(type);
        });
    });
    $('#resetFlt-' + type).addEventListener('click', () => {
      resetFilter(type);
    });
    const btnQuickPkg = $('#btnQuickPackage-' + type);
    if (btnQuickPkg) {
      btnQuickPkg.addEventListener('click', async () => {
        const ds = getDs(type);
        if (!ds) {
          toast('Chưa có dữ liệu phiếu cân.', 'warning');
          return;
        }
        const rows = currentRows(type);
        if (!rows.length) {
          toast('Chưa chọn phiếu cân nào trong phạm vi hiện tại.', 'warning');
          return;
        }
        HAK.Loading.show('Đang tạo trọn bộ hồ sơ (Biên bản + Bảng kê chi tiết' + (pageBkls(type) ? ' + BKLS Mẫu 01' : '') + ')…');
        try {
          // 1. Tạo file Word Biên bản chính
          await generate(type);
          // 2. Xuất file Excel Bảng kê xe
          await generate(type, 'xlsx');
          // 3. Nếu có BKLS, xuất luôn BKLS
          if (pageBkls(type)) {
            await generateBkls(type);
          }
          toast('✅ Đã xuất thành công trọn bộ hồ sơ xuất hàng!', 'success');
        } catch (err) {
          toast('Lỗi khi xuất hồ sơ: ' + (err.message || err), 'error');
        } finally {
          HAK.Loading.hide();
        }
      });
    }

    $('#gen-' + type).addEventListener('click', () => generate(type));
    $('#pdf-' + type).addEventListener('click', () => generate(type, 'pdf'));
    $('#xls-' + type).addEventListener('click', () => generate(type, 'xlsx'));
    if (pageBkls(type)) {
      $('#bkls-' + type).addEventListener('click', () => generateBkls(type));
      sec.addEventListener('click', (e) => {
        // "Dùng <số kế tiếp>" dưới ô Số BKLS
        const a = e.target.closest('[data-bkls-next]');
        if (!a) return;
        e.preventDefault();
        $('#' + fid(type, 'bklsSoBkls')).value = a.dataset.bklsNext;
        save();
        upd();
      });
    }
    if (DOCS[type].extra === 'returned') $('#btnReturn-' + type).addEventListener('click', () => openReturnModal(type));
    $('#btnOmit-' + type).addEventListener('click', () => openOmitModal(type));
    $('#btnPick-' + type).addEventListener('click', () => openPickModal(type));
    if (CONV_FROM[type])
      sec.addEventListener('click', (e) => {
        const b = e.target.closest('[data-conv]');
        if (b) convertTo(type, b.dataset.conv);
      });
    sec.addEventListener('click', (e) => {
      const btnMatch = e.target.closest('[data-smart-match-ship]');
      if (btnMatch) {
        const ds = getDs(type);
        const shipEl = $('#' + fid(type, 'ship'));
        const shipName = (shipEl ? shipEl.value : '').trim();
        const shipNorm = HAK.Excel && HAK.Excel.util && HAK.Excel.util.norm ? HAK.Excel.util.norm(shipName) : shipName.toLowerCase();
        if (ds && ds.rows && shipNorm.length >= 2) {
          const matchedSet = new Set();
          ds.rows.forEach((r) => {
            const wh = HAK.Excel && HAK.Excel.util && HAK.Excel.util.norm ? HAK.Excel.util.norm(r.wh || '') : (r.wh || '').toLowerCase();
            const nt =
              HAK.Excel && HAK.Excel.util && HAK.Excel.util.norm ? HAK.Excel.util.norm(r.note || '') : (r.note || '').toLowerCase();
            if (wh.includes(shipNorm) || nt.includes(shipNorm)) matchedSet.add(r.idx);
          });
          if (matchedSet.size > 0) {
            ds.rows.forEach((r) => {
              if (!matchedSet.has(r.idx)) ST[type].omit.add(r.idx);
              else ST[type].omit.delete(r.idx);
            });
            save();
            upd();
            toast('Đã tự động lọc chính xác ' + matchedSet.size + ' phiếu cân cho tàu "' + shipName + '".', 'success');
          }
        }
        return;
      }

      const btnDup = e.target.closest('[data-omit-dups]');
      if (btnDup) {
        const rows = currentRows(type);
        if (HAK.Yearbook && HAK.Yearbook.checkDuplicates) {
          const act = HAK.Yearbook.active ? HAK.Yearbook.active(type) : null;
          const dups = HAK.Yearbook.checkDuplicates(act ? act.id : null, rows);
          if (dups.length > 0) {
            dups.forEach((d) => ST[type].omit.add(d.row.idx));
            save();
            upd();
            toast('Đã bỏ chọn ' + dups.length + ' phiếu cân bị trùng với hồ sơ khác.', 'info');
          }
        }
        return;
      }

      // v2.7.0 tab vùng nhập liệu + nút Quay lại / Tiếp
      const b = e.target.closest('.zone-tab, [data-zone-go]');
      if (!b) return;
      showZone(type, b.dataset.zoneGo || b.dataset.zone);
      if (b.dataset.zoneGo) {
        const nav = $('#zones-' + type);
        if (nav && nav.getBoundingClientRect().top < 0) nav.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    });
  }

  /* ===============================================================
   * v2.6.7 ➡ Chuyển Xuất hàng kho gửi → Xuất khẩu / Ủy thác / Xuất bán (Thủy chốt 28/09/2026, phương án A — chép đợt).
   * Chép (các) đợt Excel góp phần vào phạm vi đang lọc sang hình thức đích + mang theo: tàu, lọc ngày / nhãn, chỉ các đợt đó (filter.files),
   * xe trả về (đích có "xe trả về") hoặc loại xe trả về khỏi phạm vi (Xuất bán — filter.exclude), bên gửi → bên xuất, kho xuất.
   * Bên nhận ủy thác / bên mua: chọn theo hợp đồng ở trang đích. Mỗi đợt 1 hình thức (đợt đã chuyển sang hình thức khác → chặn).
   * ============================================================= */
  const fileOfUid = (u) => {
    u = String(u === undefined ? '' : u);
    const i = u.lastIndexOf('#');
    return i < 0 ? '' : u.slice(0, i);
  };
  async function convertTo(src, dst) {
    const ds = getDs(src);
    if (!ds) {
      toast('Chưa có dữ liệu Excel để chuyển.', 'warning');
      return;
    }
    const p = collect(src);
    if (fieldDef(src, 'ship') && !String(p.ship || '').trim()) {
      toast('Nhập tên tàu trước khi chuyển.', 'warning');
      focusField(src, 'ship');
      return;
    }
    const rows = G().filterRows(ds.rows, p.filter);
    if (!rows.length) {
      toast('Không có phiếu cân nào trong phạm vi đang lọc.', 'warning');
      return;
    }
    const files = Array.from(new Set(rows.map((r) => fileOfUid(r.uid)).filter(Boolean)));
    const list = ((HAK.App.slots[src] && HAK.App.slots[src].batches) || []).filter(
      (b) => files.indexOf(b.fileName) >= 0 && b.ds && b.ds.ok
    );
    if (!list.length) {
      toast('Không tìm thấy đợt Excel của phạm vi này.', 'error');
      return;
    }
    const other = list.filter((b) => b.conv && b.conv.to && b.conv.to !== dst);
    if (other.length) {
      toast(
        'Mỗi đợt chỉ chuyển sang 1 hình thức: ' +
          other.map((b) => '"' + b.fileName + '" đã chuyển sang ' + DOCS[b.conv.to].title).join('; ') +
          '. Muốn đổi: vào Nhập liệu → ' +
          DOCS[other[0].conv.to].title +
          ' → xóa đợt đã chép, rồi chuyển lại.',
        'warning'
      );
      return;
    }
    HAK.UI.Loading.show('Đang chuyển ' + list.length + ' đợt sang ' + DOCS[dst].title + '…');
    let ok = false;
    try {
      ok = await HAK.App.copyBatches(src, list, dst);
    } catch (e) {
      console.error(e);
      toast('Không chuyển được: ' + (e.message || e), 'error');
      return;
    } finally {
      HAK.UI.Loading.hide();
    }
    if (!ok) {
      toast('Không đọc được dữ liệu đợt ở trang đích.', 'error');
      return;
    }
    // ---- điền sẵn trang đích ----
    const put = (id, val) => {
      const f = fieldDef(dst, id);
      if (f && val !== undefined && val !== null && val !== '') setField(dst, f, String(val));
    };
    put('ship', p.ship);
    put('giaoId', p.giaoId); // bên gửi (chủ hàng) → đơn vị xuất khẩu / bên ủy thác / bên bán
    put('khoGiaoId', p.khoGiaoId); // kho xuất (kho gửi) → kho xuất / bàn cân xuất
    put('wh', p.whLabel); // Ủy thác: cột "Kho xuất" ở phụ lục
    saveForm(dst);
    // ---- phạm vi: đúng các đợt đã chuyển + lọc ngày / nhãn; xe trả về ----
    const hasRet = DOCS[dst].extra === 'returned',
      ret = p.returned || [];
    ST[dst].filter = {
      smart: p.filter.smart ? JSON.parse(JSON.stringify(p.filter.smart)) : undefined,
      groups: p.filter.groups ? new Set(p.filter.groups) : null,
      from: p.filter.from || '',
      to: p.filter.to || '',
      timeFrom: p.filter.timeFrom || '',
      timeTo: p.filter.timeTo || '',
      ticketFrom: p.filter.ticketFrom || '',
      ticketTo: p.filter.ticketTo || '',
      pick: p.filter.pick ? p.filter.pick.slice() : undefined,
      files,
      exclude: hasRet ? null : ret.slice(),
      fromType: src,
      fromShip: p.ship || '',
    }; // giữ nguyên phạm vi tách tàu khi chuyển từ Xuất kho gửi
    ST[dst].returned = new Set(hasRet ? ret : []);
    renderConv(src);
    showZone(dst, 'party'); // bước tiếp theo ở trang đích: chọn hợp đồng
    location.hash = '#/' + dst;
    if (ST[dst].built) {
      renderFilter(dst);
      updateSummary(dst);
    }
    toast(
      'Đã chuyển ' +
        rows.length +
        ' xe (' +
        list.length +
        ' đợt) sang ' +
        DOCS[dst].title +
        (!hasRet && ret.length ? ' — đã loại ' + ret.length + ' xe trả về' : '') +
        '. Chọn hợp đồng' +
        (pageBkls(dst) ? ', nhập số BKLS' : '') +
        ' rồi tạo biên bản' +
        (pageBkls(dst) ? ' + BKLS' : '') +
        '.',
      'success'
    );
  }
  /** Trang nguồn: đợt đang dùng đã chuyển sang đâu. Trang đích: ghi chú phạm vi "chuyển từ kho gửi" + nút bỏ giới hạn. */
  function renderConv(type) {
    const st = $('#convState-' + type);
    if (st) {
      const bs = ((HAK.App.slots[type] && HAK.App.slots[type].batches) || []).filter((b) => b.conv && DOCS[b.conv.to]);
      st.innerHTML = bs.length
        ? bs
            .map(
              (b) =>
                '<div class="text-info">➡ "' +
                esc(b.fileName) +
                '" đã chuyển sang <a href="#/' +
                b.conv.to +
                '">' +
                esc(DOCS[b.conv.to].title) +
                '</a></div>'
            )
            .join('')
        : '';
    }
    const nb = $('#convNote-' + type),
      f = ST[type] && ST[type].filter;
    if (!nb) return;
    if (!f || !f.files || !f.files.length) {
      nb.innerHTML = '';
      return;
    }
    nb.innerHTML =
      '<div class="alert alert-info py-2 px-3 mt-2 mb-0 small">➡ Phạm vi chuyển từ <b>' +
      esc((DOCS[f.fromType] || {}).title || 'hình thức khác') +
      '</b>' +
      (f.fromShip ? ' — tàu <b>' + esc(f.fromShip) + '</b>' : '') +
      ': chỉ lấy đợt ' +
      f.files.map((x) => '<span class="mono">' + esc(x) + '</span>').join(', ') +
      (f.exclude && f.exclude.length ? ', đã loại ' + f.exclude.length + ' xe trả về' : '') +
      '. Bấm "Đặt lại bộ lọc" để lấy toàn bộ dữ liệu của trang này.</div>';
  }

  /* ---------------------------------------------------------------
   * v2.19.0 — KHỞI TẠO / CHUYỂN HỒ SƠ dùng chung: mọi đường tạo mới (nút "Thêm mới", nạp dữ liệu Excel mới, bỏ hồ sơ đang xem) đều qua resetRecordState,
   * nên không còn sót trạng thái của hồ sơ trước: phiếu chọn riêng, phiếu bỏ, xe trả về, lọc ngày / giờ / số phiếu, liên kết hợp đồng, bản chụp.
   * Chỉ giữ công ty và kho mặc định (chủ đích: người dùng thường lập nhiều hồ sơ liên tiếp cho cùng công ty / kho).
   * Có thay đổi chưa lưu → guardLeave hỏi: Lưu rồi tiếp tục · Bỏ thay đổi · Quay lại (Hủy giữ nguyên form đang làm).
   * ------------------------------------------------------------- */
  function resetRecordState(type, opt) {
    opt = opt || {};
    const st = ST[type];
    if (HAK.Pages && st.ro) HAK.Pages.readOnly(type, false);
    if (HAK.Yearbook) HAK.Yearbook.clear(type);
    const sel = $('#' + fid(type, 'contractId'));
    if (sel) sel.disabled = false;
    delete st.savedDs;
    delete st.snapshotParams;
    if (opt.fields !== false)
      DOCS[type].groups.forEach((g) =>
        g.fields.forEach((f) => {
          if (f.type !== 'company' && f.type !== 'warehouse')
            setField(type, f, f.type === 'check' ? !!f.def : f.def !== undefined ? f.def : '');
        })
      );
    st.filter = { groups: null, from: '', to: '' };
    st.returned.clear();
    st.omit.clear();
    st.ctPending = null;
    st.bklsDupKey = '';
    const box = $('#ctMsg-' + type);
    if (box) box.innerHTML = '';
    const note = $('#year-note-' + type);
    if (note && HAK.Yearbook) note.textContent = 'Hồ sơ mới — năm ' + HAK.Yearbook.year;
    renderFilter(type);
    updateSummary(type);
    markClean(type);
  }
  /** Chữ ký trạng thái đang làm (giá trị ô + phạm vi + phiếu chọn / bỏ / trả về) để biết có thay đổi chưa lưu. */
  function sigOf(type) {
    const vals = [];
    DOCS[type].groups.forEach((g) =>
      g.fields.forEach((f) => {
        const el = $('#' + fid(type, f.id));
        if (el) vals.push([f.id, f.type === 'check' ? el.checked : el.value]);
      })
    );
    const f = ST[type].filter;
    return JSON.stringify([
      vals,
      f.from,
      f.to,
      f.timeFrom || '',
      f.timeTo || '',
      f.ticketFrom || '',
      f.ticketTo || '',
      f.pick || [],
      f.files || null,
      Array.from(ST[type].omit.keys()).sort(),
      Array.from(ST[type].returned).sort(),
    ]);
  }
  function markClean(type) {
    ST[type].baseSig = sigOf(type);
  }
  const isDirty = (type) => ST[type].baseSig !== undefined && !ST[type].ro && sigOf(type) !== ST[type].baseSig;
  /** Hộp 3 lựa chọn (Lưu / Bỏ / Quay lại). HAK.Pages._choose để kiểm thử thay thế. */
  function choose3(message) {
    if (HAK.Pages && HAK.Pages._choose) return Promise.resolve(HAK.Pages._choose(message));
    return new Promise((ok) => {
      let m = $('#leaveModal');
      if (!m) {
        m = document.createElement('div');
        m.className = 'modal fade';
        m.id = 'leaveModal';
        m.tabIndex = -1;
        m.innerHTML =
          '<div class="modal-dialog"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">Có thay đổi chưa lưu</h5></div><div class="modal-body" id="leaveMsg"></div>' +
          '<div class="modal-footer"><button class="btn btn-primary" data-choice="save" type="button">💾 Lưu rồi tiếp tục</button><button class="btn btn-outline-danger" data-choice="discard" type="button">Bỏ thay đổi</button><button class="btn btn-outline-secondary" data-choice="back" type="button">Quay lại</button></div></div></div>';
        document.body.appendChild(m);
      }
      $('#leaveMsg').textContent = message;
      const inst = bootstrap.Modal.getOrCreateInstance(m, { backdrop: 'static', keyboard: false });
      const onClick = (e) => {
        const b = e.target.closest('[data-choice]');
        if (!b) return;
        m.removeEventListener('click', onClick);
        inst._isTransitioning ? m.addEventListener('shown.bs.modal', () => inst.hide(), { once: true }) : inst.hide();
        ok(b.dataset.choice);
      };
      m.addEventListener('click', onClick);
      inst.show();
    });
  }
  /** true = được phép chuyển hồ sơ (đã lưu hoặc chọn bỏ); false = ở lại (Quay lại / lưu lỗi). */
  async function guardLeave(type) {
    if (!isDirty(type)) return true;
    const c = await choose3(
      'Biểu mẫu "' +
        DOCS[type].title +
        '" có thay đổi chưa lưu (phiếu chọn / bỏ, xe trả về, phạm vi lọc hoặc thông tin đã nhập). Làm gì trước khi chuyển hồ sơ?'
    );
    if (c === 'discard') return true;
    if (c === 'save') {
      try {
        await HAK.Yearbook.saveAsk(type);
        markClean(type);
        return true;
      } catch (err) {
        toast('Chưa lưu được hồ sơ nên chưa chuyển: ' + (err.message || err), 'error');
        return false;
      }
    }
    return false; // Quay lại / Hủy: giữ nguyên form đang làm
  }
  async function newRecord(type) {
    if (!(await guardLeave(type))) return false;
    resetRecordState(type);
    return true;
  }
  /**
   * "Dùng phạm vi đang xem": chuyển điều kiện của LỌC XEM TRƯỚC (Nhập liệu) sang PHẠM VI LẬP CHỨNG TỪ của trang biên bản `type`.
   * Trả { moved: [nhãn], skipped: [nhãn không chuyển được], rows, kg } để báo trước khi người dùng lập chứng từ.
   */
  function useScope(type, state) {
    const st = ST[type];
    if (!st) return { moved: [], skipped: [], rows: 0, kg: 0 };
    const s = JSON.parse(JSON.stringify(state || {})),
      moved = [],
      skipped = [],
      ok = { sel: ['plate', 'carrier'], flag: ['warnings'] };
    ['sel', 'one', 'flag'].forEach((kind) =>
      Object.keys(s[kind] || {}).forEach((k) => {
        if ((ok[kind] || []).indexOf(k) >= 0)
          moved.push(k === 'plate' ? 'Biển số' : k === 'carrier' ? 'Đơn vị vận chuyển' : 'Chỉ dòng có cảnh báo');
        else {
          skipped.push(k);
          delete s[kind][k];
        }
      })
    );
    if (s.q) moved.push('Tìm: ' + s.q);
    if (s.tu || s.den) moved.push('Ngày ' + (s.tu || '…') + ' → ' + (s.den || '…'));
    st.filter.smart = s;
    st.filter.from = s.tu || '';
    st.filter.to = s.den || '';
    if (!st.built) return { moved, skipped, rows: 0, kg: 0, pending: true };
    if (st.built) {
      try {
        documentSmart(type);
      } catch (e) {
        console.warn(e);
      }
      renderFilter(type);
      updateSummary(type);
    }
    const rows = currentRows(type),
      sum = G().summarize(rows);
    return { moved, skipped, rows: rows.length, kg: sum.kg };
  }
  function resetFilter(type) {
    const ds = getDs(type);
    ST[type].filter = { groups: null, from: '', to: '' };
    if (ds) ST[type].filter.groups = new Set(ds.stats.groups.map((g) => g.label));
    ST[type].returned.clear();
    renderFilter(type);
    updateSummary(type);
  }

  /** Hiện/ẩn 2 ô nhập tay khi chọn "Khác — nhập tay…" */
  function toggleCustomWh(sel) {
    const box = document.getElementById(sel.id + '-custom');
    if (box) box.classList.toggle('d-none', sel.value !== WH_CUSTOM);
  }

  function toggleCustomTxt(sel) {
    const t = document.getElementById(sel.id + '__txt');
    if (t) {
      t.classList.toggle('d-none', sel.value !== WH_CUSTOM);
      if (sel.value === WH_CUSTOM) t.focus();
    }
  }

  /** Chiều điều chuyển → tự chọn bên giao/nhận và kho đi/đến mặc định. */
  function pickCompany(kind) {
    return cfg().companies.find((c) => c.kind === kind) || cfg().companies[0];
  }
  function applyDirection(type) {
    const dir = $('#' + fid(type, 'direction')).value;
    const whBy = (id) => (cfg().warehouses.find((w) => w.id === id) || cfg().warehouses[0]).id;
    // Kho đi lấy từ nhóm "Xuất kho tại", kho đến lấy từ nhóm "Nhập kho tại"
    const kg = $('#' + fid(type, 'khoGiaoId')),
      kn = $('#' + fid(type, 'khoNhanId'));
    kg.value = dir === 'cn2ct' ? whBy('w_qs') : whBy('w_dn');
    kn.value = dir === 'cn2ct' ? whBy('w_n_hak') : whBy('w_n_cn');
    toggleCustomWh(kg);
    toggleCustomWh(kn);
    saveForm(type);
    updateSummary(type);
  }

  /* Chọn hợp đồng từ Danh mục: xem js/pages-contract.js */
  let {
    fieldDef,
    contractOptions,
    contractValues,
    fieldValue,
    setField,
    resetField,
    ctFillKey,
    applyContractFilter,
    selectedContract,
    applyContract,
    resolveConflicts,
    refreshContracts,
  } = HAK.PagesContract({
    HAK,
    $,
    esc,
    toast,
    BKLS_TYPES,
    DOCS,
    ST,
    cfg,
    getDs,
    fid,
    WH_CUSTOM,
    whAttrList: (...a) => whAttrList(...a),
    whoptValue: (...a) => whoptValue(...a),
    toggleCustomWh: (...a) => toggleCustomWh(...a),
    saveForm: (...a) => saveForm(...a),
    currentRows: (...a) => currentRows(...a),
    renderCatalogNotice: (...a) => renderCatalogNotice(...a),
    updateSummary: (...a) => updateSummary(...a),
  });
  /* ===============================================================
   * Đọc / lưu giá trị form
   * ============================================================= */
  function collect(type) {
    const D = DOCS[type],
      p = {};
    D.groups.forEach((g) =>
      g.fields.forEach((f) => {
        const el = $('#' + fid(type, f.id));
        if (!el) return;
        p[f.id] = f.type === 'check' ? el.checked : (f.type === 'whopt' ? whoptValue(el) : el.value).trim();
        if (f.type === 'warehouse' && p[f.id] === WH_CUSTOM) {
          // kho nhập tay → đăng ký tạm để Config.warehouse() tìm được
          const nm = ($('#' + fid(type, f.id) + '__name').value || '').trim(),
            ad = ($('#' + fid(type, f.id) + '__addr').value || '').trim();
          const cid = '__c_' + type + '_' + f.id;
          HAK.Config.custom[cid] = { id: cid, name: nm, short: nm, address: ad, type: 'Kho nhập tay' };
          p[f.id] = cid;
        }
      })
    );
    const stt = ST[type];
    const ds = getDs(type);
    const allLabels = ds ? ds.stats.groups.map((g) => g.label) : [];
    const sel = stt.filter.groups;
    p.filter = { groups: sel && sel.size < allLabels.length ? Array.from(sel) : null, from: stt.filter.from, to: stt.filter.to };
    ['timeFrom', 'timeTo', 'ticketFrom', 'ticketTo'].forEach((k) => {
      if (stt.filter[k]) p.filter[k] = stt.filter[k];
    });
    if (stt.filter.pick && stt.filter.pick.length) p.filter.pick = stt.filter.pick.slice(); // phiếu chọn riêng cho tàu này          // tách phiếu cân trong cùng ngày
    if (stt.filter.smart)
      p.filter.smart = Object.assign(JSON.parse(JSON.stringify(stt.filter.smart)), { tu: stt.filter.from || '', den: stt.filter.to || '' });
    if (stt.filter.files && stt.filter.files.length) p.filter.files = stt.filter.files.slice(); // v2.6.7: phạm vi chuyển từ kho gửi
    if (stt.filter.exclude && stt.filter.exclude.length) p.filter.exclude = stt.filter.exclude.slice();
    if (stt.omit && stt.omit.size) {
      p.filter.omit = Array.from(stt.omit.keys());
      p.filter.omitLog = Array.from(stt.omit.values());
    } // phiếu bỏ tay + lý do
    if (D.extra === 'returned') p.returned = Array.from(stt.returned);
    if (type === 'dieuchuyen') {
      const ct = pickCompany('Công ty'),
        cn = pickCompany('Chi nhánh');
      const hak = cfg().companies.find((c) => c.id === 'hak') || ct,
        cnn = cfg().companies.find((c) => c.id === 'cn') || cn;
      p.giaoId = p.direction === 'cn2ct' ? cnn.id : hak.id;
      p.nhanId = p.direction === 'cn2ct' ? hak.id : cnn.id;
      p.docDate = p.qdDate;
    }
    const linked = ST[type].snapshotParams ? null : selectedContract(type);
    // v2.17.0 — bản chụp số liệu chứng thư dùng để lập chứng từ (nguồn Danh mục / điều chỉnh riêng + lý do); mở lại hồ sơ cũ KHÔNG đọc lại Danh mục.
    if (HAK.Cert && fieldDef(type, 'certNo')) {
      const old = ST[type].snapshotParams && ST[type].snapshotParams.certSnap;
      const det = linked
        ? Object.assign({}, linked, { id: linked.detailId || linked.id })
        : old
          ? {
              id: old.detailId,
              certNo: old.catalog.certNo,
              certDate: old.catalog.certDate,
              mt: old.catalog.certWet,
              bdmt: old.catalog.certDry,
              moisture: old.catalog.moisture,
            }
          : null;
      if (det) p.certSnap = HAK.Cert.snapshot(det, p, p.certReason, old && old.at && !linked ? old.at : undefined);
    }
    if (linked) {
      p.product = linked.product || '';
      p.contractNo = p.contractNo || linked.no || '';
      p.tkhq = linked.tkhq || '';
      p.parentContractId = linked.parentId;
      p.contractDetailId = linked.detailId;
    }
    if (ST[type].snapshotParams) {
      const merged = Object.assign({}, ST[type].snapshotParams, p);
      // Hồ sơ cũ mở ra: ô chọn hợp đồng bị khóa (trống) → không được ghi đè liên kết chi tiết hợp đồng đã lưu trong hồ sơ.
      if (!merged.contractId && ST[type].snapshotParams.contractId) merged.contractId = ST[type].snapshotParams.contractId;
      return merged;
    }
    return p;
  }
  function saveForm(type) {
    const o = {};
    DOCS[type].groups.forEach((g) =>
      g.fields.forEach((f) => {
        const el = $('#' + fid(type, f.id));
        if (!el || f.type === 'date') return; // ngày luôn mặc định là hôm nay
        o[f.id] = f.type === 'check' ? el.checked : f.type === 'whopt' ? whoptValue(el) : el.value;
        if (f.type === 'warehouse') {
          o[f.id + '__name'] = $('#' + fid(type, f.id) + '__name').value;
          o[f.id + '__addr'] = $('#' + fid(type, f.id) + '__addr').value;
        }
      })
    );
    HAK.Store.set('hak.form.' + type, o);
  }

  /* Bộ lọc phạm vi dữ liệu và tóm tắt trực tiếp: xem js/pages-filter.js */
  let {
    documentSmart,
    renderFilter,
    currentRows,
    scopeSummary,
    renderContext,
    catalogDiff,
    renderCatalogNotice,
    explainZero,
    expiredConditions,
    updateSummary,
  } = HAK.PagesFilter({
    HAK,
    $,
    esc,
    G,
    fmtInt,
    pageBkls,
    DOCS,
    ST,
    cfg,
    getDs,
    fid,
    isDirty,
    fieldDef,
    contractValues,
    fieldValue,
    ctFillKey,
    selectedContract,
    applyContract,
    renderZones: (...a) => renderZones(...a),
    renderConv: (...a) => renderConv(...a),
    collect: (...a) => collect(...a),
    bklsHint: (...a) => bklsHint(...a),
    omittedInfo: (...a) => omittedInfo(...a),
  });
  /* ===============================================================
   * Sinh biên bản
   * ============================================================= */
  function showMessages(type, res) {
    const box = $('#msgs-' + type);
    if (!box) return;
    let h = '';
    if (res.errors.length)
      h +=
        '<div class="alert alert-danger py-2 mb-2"><ul class="alert-list">' +
        res.errors.map((e) => '<li>' + esc(e) + '</li>').join('') +
        '</ul></div>';
    if (res.warnings.length)
      h +=
        '<div class="alert alert-warning py-2 mb-2" id="warnBox-' +
        type +
        '"><div class="fw-semibold mb-1">Lưu ý khi lập hồ sơ:</div><ul class="alert-list">' +
        res.warnings.map((e) => '<li>' + esc(e) + '</li>').join('') +
        '</ul></div>';
    box.innerHTML = h;
    if (res.warnings.length && !res.errors.length) {
      try {
        box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (err) {}
    }
  }

  /** Lưu hồ sơ vào 🗄️ Lưu trữ (không bao giờ làm hỏng việc xuất file). */
  async function archive(type, params, res, ds, mode) {
    if (HAK.Yearbook && HAK.Yearbook.active(type) && HAK.Yearbook.active(type).readonly) return false;
    // Chỉ trả true (→ thông báo "đã lưu vào Lưu trữ") khi giao dịch IndexedDB đã HOÀN TẤT; lỗi ghi thì báo rõ cho người dùng (file Word/PDF/Excel đã xuất vẫn dùng được).
    const fail = (why) => {
      toast(
        '⚠ Đã xuất file nhưng CHƯA lưu được hồ sơ vào Lưu trữ: ' +
          why +
          ' — xuất lại sau khi xử lý (dung lượng trình duyệt, cửa sổ khác đang mở app) hoặc dùng Cài đặt → Sao lưu toàn bộ.',
        'error'
      );
      return false;
    };
    let ok = false;
    try {
      ok = !!(HAK.Archive && (await HAK.Archive.save(type, params, res, ds, mode)));
      if (!ok && HAK.Archive && HAK.Archive.lastError) fail(HAK.Archive.lastError);
    } catch (e) {
      console.warn(e);
      fail(e && e.message ? e.message : String(e));
    }
    try {
      if (HAK.Yearbook && ds === getDs(type)) await HAK.Yearbook.saveAsk(type, true);
    } catch (e) {
      // sổ năm là kho riêng: lỗi ở đây không làm mất trạng thái lưu của Lưu trữ
      console.warn('Sổ hồ sơ năm:', e);
    }
    return ok;
  }
  const SAVED = ' · đã lưu vào Lưu trữ';
  /**
   * In PDF theo từng ĐỢT (trước đây chặn > 100 / > 200 xe): gom các file theo trọng số "số xe" tới PDF_BATCH rồi mở hộp thoại in cho từng đợt;
   * giữa các đợt hỏi người dùng (đã lưu PDF đợt trước chưa) nên không dựng hàng nghìn trang trong một lần.
   */
  async function printInBatches(files, weights) {
    const cap = (HAK.Bkls && HAK.Bkls.PDF_BATCH) || 150,
      batches = [];
    let cur = [],
      w = 0;
    files.forEach((f, i) => {
      const x = weights[i] || 0;
      if (cur.length && w + x > cap) {
        batches.push(cur);
        cur = [];
        w = 0;
      }
      cur.push(f);
      w += x;
    });
    if (cur.length) batches.push(cur);
    for (let i = 0; i < batches.length; i++) {
      if (
        i > 0 &&
        !(await (HAK.UI && HAK.UI.confirm
          ? HAK.UI.confirm(
              'Đã mở hộp thoại in đợt ' +
                i +
                '/' +
                batches.length +
                '.\n\nBấm Đồng ý để in đợt ' +
                (i + 1) +
                '/' +
                batches.length +
                ' (nhớ đã lưu PDF đợt trước); Hủy để dừng.',
              { title: 'In theo đợt', okText: 'In đợt tiếp' }
            )
          : Promise.resolve(
              typeof confirm === 'function' &&
                confirm(
                  'Đã mở hộp thoại in đợt ' +
                    i +
                    '/' +
                    batches.length +
                    '.\n\nBấm OK để in đợt ' +
                    (i + 1) +
                    '/' +
                    batches.length +
                    ' (nhớ đã lưu PDF đợt trước); Hủy để dừng.'
                )
            )))
      ) {
        toast('Đã dừng sau đợt in ' + i + '/' + batches.length + '.', 'warning');
        return;
      }
      const first = batches[i][0].name.replace(/\.docx$/i, '');
      await HAK.Word.Pdf.print(batches[i], { title: batches.length > 1 ? first + '_dot' + (i + 1) + 'of' + batches.length : undefined });
      if (batches.length > 1) await new Promise((r) => setTimeout(r, 600)); // chờ trình duyệt dọn bản in đợt trước
    }
  }

  /** Xác nhận trước khi xuất: công ty · tàu · số phiếu · bỏ · trả về · thực giao (cùng tập phiếu với màn hình). Test đặt HAK.Pages._confirmScope. */
  async function confirmScope(type, what, warnings) {
    let txt = (what || 'Lập chứng từ "' + DOCS[type].title + '"') + ' cho:\n' + scopeSummary(type);
    let w = warnings;
    if (!w) {
      const box = $('#warnBox-' + type);
      if (box) w = Array.from(box.querySelectorAll('li')).map((li) => li.textContent);
    }
    if (w && w.length) {
      txt += '\n\nLưu ý:\n' + w.map((x) => '• ' + x).join('\n');
    }
    txt += '\n\nĐúng phạm vi cần lập? (Hủy để chỉnh lại)';
    if (HAK.Pages && HAK.Pages._confirmScope) return await HAK.Pages._confirmScope(txt, type);
    if (HAK.UI && HAK.UI.confirm) return await HAK.UI.confirm(txt, { title: 'Xác nhận tạo biên bản', okText: 'Đồng ý', cancelText: 'Hủy' });
    return typeof root.confirm === 'function' ? root.confirm(txt) : true;
  }
  /** src (tùy chọn) = { ds, params } lấy từ hồ sơ Lưu trữ → dựng lại mà không cần file Excel cân. */
  async function generate(type, mode, src) {
    const ds = src ? src.ds : getDs(type);
    if (!ds) {
      toast('Chưa có dữ liệu Excel.', 'error');
      return;
    }
    const params = src ? src.params : collect(type);
    let res;
    try {
      res = HAK.Yearbook
        ? HAK.Yearbook.underContext(src ? null : HAK.Yearbook.active(type), () => G().build(type, ds, params))
        : G().build(type, ds, params);
    } catch (e) {
      console.error(e);
      toast('Lỗi khi tính dữ liệu: ' + e.message, 'error');
      return;
    }
    showMessages(type, res);
    if (res.errors.length) {
      toast(res.errors[0], 'error');
      if (!src) focusError(type, res.errors[0]);
      return;
    }
    if (!src && !(await confirmScope(type))) return;
    const btn = $('#' + (mode === 'pdf' ? 'pdf-' : mode === 'xlsx' ? 'xls-' : 'gen-') + type);
    btn.disabled = true;
    if (mode === 'pdf') {
      // PDF: dựng bản in từ DOCX → hộp thoại in → "Lưu dưới dạng PDF"
      Loading.show('Đang dựng bản in PDF…');
      try {
        await HAK.Word.Pdf.print(res.files, {
          title: res.files[res.files.length - 1].name,
          onProgress: Loading.set,
          beforePrint: () => {
            Loading.hide();
            toast(
              'Trong hộp thoại in, chọn máy in "Lưu dưới dạng PDF" (Save as PDF) rồi bấm Lưu. Nên tắt mục "Đầu trang và chân trang".',
              'info'
            );
          },
        });
        await archive(type, params, res, ds, 'pdf');
      } catch (e) {
        console.error(e);
        toast(e.message || String(e), 'error');
      } finally {
        Loading.hide();
        btn.disabled = false;
      }
      return;
    }
    if (mode === 'xlsx') {
      // Excel lưu trữ: bảng cân chi tiết (kiểu A / kiểu B) — dữ liệu do generator dựng sẵn ở res.excel
      Loading.show('Đang xuất file Excel…');
      try {
        if (!res.excel) throw new Error('Loại biên bản này chưa có dữ liệu xuất Excel.');
        await new Promise((ok) => setTimeout(ok, 30)); // cho vòng quay "Đang xuất…" kịp hiện trước khi dựng file
        const out = await HAK.Exporter.download(res.excel);
        if (!out) return;
        const sv = await archive(type, params, res, ds, 'xlsx');
        toast(
          'Đã xuất: ' +
            out.name +
            ' (' +
            out.rows.toLocaleString('vi-VN') +
            ' phiếu' +
            (out.sheets > 1 ? ', ' + out.sheets + ' sheet' : '') +
            ')' +
            (sv ? SAVED : '') +
            ' — ' +
            scopeSummary(type),
          'success'
        );
      } catch (e) {
        console.error(e);
        toast(e.message || String(e), 'error');
      } finally {
        Loading.hide();
        btn.disabled = false;
      }
      return;
    }
    Loading.show('Đang tạo biên bản…');
    try {
      const zipName = res.files.length > 1 ? res.files[res.files.length - 1].name.replace(/\.docx$/, '') + '.zip' : '';
      const done = await HAK.Word.Files.generateAndSave(res.files, { zip: !!params.zip, zipName, onProgress: Loading.set });
      const names = params.zip && done.length > 1 ? zipName : done.map((d) => d.name).join(', ');
      if (!done.length) return;
      const sv = await archive(type, params, res, ds, 'word');
      toast(
        'Đã sinh: ' +
          names +
          (res.warnings.length ? ' (có ' + res.warnings.length + ' lưu ý)' : '') +
          (sv ? SAVED : '') +
          ' — ' +
          scopeSummary(type),
        'success'
      );
    } catch (e) {
      console.error(e);
      toast(e.message || String(e), 'error');
    } finally {
      Loading.hide();
      btn.disabled = false;
    }
  }

  /* Bảng kê lâm sản (BKLS) Tổng + Từng xe, sinh song song với biên bản: xem js/pages-bkls.js */
  let { bklsMissing, bklsHint, generateBkls } = HAK.PagesBkls({
    HAK,
    $,
    esc,
    toast,
    Loading,
    G,
    fmtInt,
    NGUON_GOC_DEF,
    maHsOf,
    BKLS_TYPES,
    BKLS_HAS_RETURNED,
    DOCS,
    ST,
    getDs,
    fid,
    SAVED,
    collect: (...a) => collect(...a),
    confirmScope: (...a) => confirmScope(...a),
    archive: (...a) => archive(...a),
    printInBatches: (...a) => printInBatches(...a),
    fieldDef: (...a) => fieldDef(...a),
    setField: (...a) => setField(...a),
  });

  /* Hộp thoại Bỏ phiếu / Chọn phiếu / Xe trả về: xem js/pages-modals.js */
  let {
    PICK_PAGE,
    confirmPickConflicts,
    initReturnModal,
    omittedInfo,
    openOmitModal,
    openPickModal,
    openReturnModal,
    pickView,
    resolveTicket,
  } = HAK.PagesModals({
    G,
    ST,
    $,
    esc,
    toast,
    debounce,
    fmtInt,
    getDs,
    collect: (...a) => collect(...a),
    currentRows: (...a) => currentRows(...a),
    updateSummary: (...a) => updateSummary(...a),
  });

  /* ===============================================================
   * API công khai
   * ============================================================= */
  function refreshSelects() {
    Object.keys(DOCS).forEach((type) => {
      if (!ST[type].built) return;
      $$('#page-' + type + ' select[data-kind]').forEach((sel) => {
        if (sel.dataset.kind === 'whopt') {
          // dropdown ghi phụ lục / ký hiệu: dựng lại theo danh mục kho
          const cur = whoptValue(sel),
            t = document.getElementById(sel.id + '__txt');
          sel.innerHTML = whAttrOptions(sel.dataset.attr, cur);
          const custom = sel.value === WH_CUSTOM;
          if (t) {
            t.classList.toggle('d-none', !custom);
            if (custom) t.value = cur;
          }
          return;
        }
        const cur = sel.value;
        sel.innerHTML = sel.dataset.kind === 'company' ? companyOptions(cur) : whOptions(cur, whFirst(sel.id));
        if (!Array.from(sel.options).some((o) => o.value === cur)) sel.selectedIndex = 0;
      });
      updateSummary(type);
    });
  }

  HAK.Pages = {
    DOCS,
    init() {
      Object.keys(DOCS).forEach(buildPage);
      initReturnModal();
      window.addEventListener('hak:catalog', () => Object.keys(DOCS).forEach(refreshContracts)); // Danh mục thêm / sửa / xóa hợp đồng
    },
    /** Khi dữ liệu Excel thay đổi: đặt lại bộ lọc & tóm tắt cho mọi trang */
    onData(only) {
      Object.keys(DOCS).forEach((t) => {
        if ((!only || only === t) && ST[t].built) {
          resetRecordState(t, { fields: false }); // dữ liệu Excel đổi: dùng chung logic khởi tạo (xóa phiếu chọn / bỏ / trả về / lọc), giữ các ô đã nhập
          const c = selectedContract(t); // hợp đồng đang chọn có "lọc theo khoảng ngày cân" → giữ khoảng ngày đó cho dữ liệu mới
          if (c) applyContractFilter(t, contractValues(t, c).filter);
          updateSummary(t);
          markClean(t);
        }
      });
    },
    show(type) {
      if (ST[type].built) {
        if (ST[type].filter.smart) {
          try {
            documentSmart(type);
          } catch (e) {
            console.warn(e);
          }
        }
        refreshContracts(type);
        renderFilter(type);
        updateSummary(type);
        if (ST[type].baseSig === undefined) markClean(type);
      }
    },
    /** N-06: có biểu mẫu nào đang sửa dở chưa lưu (phiếu chọn / bỏ, xe trả về, phạm vi lọc, thông tin đã nhập) — cho cảnh báo khi đóng / tải lại trang. */
    hasUnsaved() {
      return Object.keys(ST).some((t) => isDirty(t));
    },
    unloadSnapshot(type) {
      resetRecordState(type, { fields: false });
    },
    newRecord,
    guardLeave,
    markClean,
    isDirty,
    _explainZero: explainZero,
    _expired: expiredConditions,
    scopeSummary,
    useScope,
    hasType: (t) => !!ST[t],
    _st: (t) => ST[t],
    _catalogDiff: catalogDiff,
    _renderContext: renderContext,
    _pick: { resolveTicket, view: () => pickView(), PICK_PAGE },
    readOnly(type, on) {
      ST[type].ro = !!on;
      $$('#page-' + type + ' input,#page-' + type + ' select,#page-' + type + ' textarea').forEach((n) => (n.disabled = on));
      if (on) $('#year-note-' + type).textContent = 'Chỉ xem năm đã đóng · Không ghi vào kho làm việc. Dùng Khôi phục năm nếu cần sửa.';
    },
    snapshot(type) {
      const ds = getDs(type);
      if (!ds) throw Error('Chưa có dữ liệu cân.');
      const params = collect(type);
      return { params, rows: JSON.parse(JSON.stringify(G().filterRows(ds.rows, params.filter))) };
    },
    openSnapshot(record) {
      const type = record.type;
      if (!DOCS[type]) throw Error('Loại hồ sơ không hỗ trợ.');
      const rows = JSON.parse(JSON.stringify(record.rows));
      ST[type].savedDs = { ok: true, rows, stats: HAK.Excel.computeStats(rows) };
      ST[type].snapshotParams = JSON.parse(JSON.stringify(record.params));
      ST[type].filter = Object.assign({ groups: null, from: '', to: '' }, record.params.filter || {});
      if (ST[type].filter.groups) ST[type].filter.groups = new Set(ST[type].filter.groups);
      ST[type].returned = new Set(record.params.returned || []);
      ST[type].omit = new Map(((record.params.filter || {}).omitLog || []).map((e) => [e.key, e]));
      Object.assign(HAK.Config.custom, (record.context && record.context.custom) || {});
      DOCS[type].groups.forEach((g) =>
        g.fields.forEach((f) => {
          const node = $('#' + fid(type, f.id)),
            value = record.params[f.id];
          if (!node) return;
          if (node.tagName === 'SELECT' && value != null && !Array.from(node.options).some((o) => o.value === value)) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value + ' (đã lưu)';
            node.append(option);
          }
          if (f.type === 'contract') return;
          if (value != null) setField(type, f, value);
          else resetField(type, f, node);
        })
      );
      const contract = $('#' + fid(type, 'contractId'));
      if (contract) {
        contract.value = '';
        contract.disabled = true;
        contract.title = 'Hồ sơ dùng thông tin hợp đồng đã lưu; chọn Thêm mới để dùng hợp đồng khác.';
      }
      renderFilter(type);
      updateSummary(type);
      $('#year-note-' + type).textContent =
        'Đang sửa hồ sơ năm ' + record.year + ' · phiên bản ' + record.revision + ' · Lưu hồ sơ để ghi thay đổi';
      markClean(type);
    },
    refreshSelects,
    generate,
    generateBkls,
    _printInBatches: (f, w) => printInBatches(f, w),
    /** Loại biên bản có lập BKLS hay không (dùng ở Lưu trữ). */
    hasBkls: (t) => pageBkls(t),
    /** Dùng cho kiểm thử tự động */
    _contractValues: contractValues,
    _collect: collect,
  };
})(window);
