/**
 * Copy for the rule-based composer, in the two languages the interface offers. Templates
 * use {placeholders} filled by the composer, mirroring how the frontend dictionary works.
 *
 * `states` are the indicator/bias words, `sentiments` the news labels (positive/negative/
 * neutral) and `indicators` a display-name map for the indicator service, which names its
 * signals in English. Vietnamese also drops the English `detail` prose that the indicator
 * service produces - the localised signal word carries the same meaning without mixing
 * languages inside a Vietnamese sentence.
 */
export const MESSAGES = {
  vi: {
    marketDataTitle: 'Dữ liệu thị trường thực tế',
    quote: '{symbol} đóng cửa gần nhất {price} ({change} trong ngày, cập nhật lúc {asOf}). Nguồn: dữ liệu {source}{realtime}.',
    realtimeNote: ', không phải thời gian thực',
    trend: 'Thay đổi 30 ngày {d30}, 90 ngày {d90}, biên 52 tuần {low} đến {high}.',
    predictionTitle: 'Dự đoán của mô hình LSTM',
    prediction: 'Mô hình ước lượng {first} vào ngày {firstDate} và {last} vào ngày {lastDate} (tầm {days} ngày). Đây là ước lượng của mô hình, không phải giá chắc chắn.',
    predictionUnavailable: 'Hiện chưa có: {reason}. Không kèm dự báo nào.',
    technicalTitle: 'Chỉ báo kỹ thuật',
    technicalItem: '{name}: {state}',
    technicalItemPlain: '{name}: {state}',
    technicalSummary: 'Xu hướng chỉ báo chung: {bias}.',
    newsTitle: 'Tâm lý tin tức',
    news: '{count} bài viết mẫu, điểm trung bình {score} ({label}): {positive} tích cực, {neutral} trung lập, {negative} tiêu cực. Cách chấm điểm: từ điển từ khóa trên tin mẫu.',
    interpretationTitle: 'Nhận định của AI',
    pointUp: 'mô hình nghiêng về tăng ({move} so với giá đóng cửa gần nhất)',
    pointDown: 'mô hình nghiêng về giảm ({move} so với giá đóng cửa gần nhất)',
    pointFlat: 'mô hình cho thấy gần như đi ngang ({move} so với giá đóng cửa gần nhất)',
    pointIndicators: 'chỉ báo nghiêng về {bias}',
    pointNews: 'tâm lý tin tức là {label}',
    agree: 'Các tín hiệu hiện có đang cùng hướng.',
    mixed: 'Các tín hiệu hiện có trái chiều, nên độ tin cậy cho một hướng duy nhất là thấp.',
    notAdvice: 'Đây là nhận định từ dữ liệu ở trên, không phải lời khuyên đầu tư.',
    market: 'Cập nhật lúc {asOf} (dữ liệu {source}, không phải thời gian thực). {advancers} mã tăng, {decliners} mã giảm, {unchanged} mã đi ngang.',
    gainers: 'Tăng mạnh nhất: {list}.',
    losers: 'Giảm mạnh nhất: {list}.',
    marketSentiment: 'Tâm lý thị trường tổng hợp đang ở mức {label} (điểm {score}). Đây không phải lời khuyên đầu tư.',
    fallbackNotice: 'Chưa gọi được mô hình ngôn ngữ bên ngoài, nên câu trả lời này do bộ soạn luật nội bộ tạo. Lý do: {reason}',
    help: 'Tôi là Alpha AI, chuyên gia phân tích cổ phiếu thời gian thực cho đề tài KLCN-284. Hãy hỏi tôi về một mã đã niêm yết, ví dụ:\n- Triển vọng hiện tại của VIC thế nào?\n- Cho xem dự đoán LSTM của FPT trong 30 ngày\n- HPG có quá mua không? RSI và MACD nói gì?\n- Tâm lý tin tức của VCB ra sao?\n- Hôm nay thị trường thế nào?\n\nTôi chỉ báo cáo dữ liệu và kết quả mô hình từ các dịch vụ đã kết nối, không bao giờ bịa giá hay dự báo.',
    states: { bullish: 'tăng giá', bearish: 'giảm giá', neutral: 'trung lập' },
    sentiments: { positive: 'tích cực', neutral: 'trung lập', negative: 'tiêu cực' },
    indicators: {
      'Bollinger Bands (20, 2)': 'Dải Bollinger (20, 2)',
      'Moving averages': 'Đường trung bình động',
      Volume: 'Khối lượng'
    }
  },
  en: {
    marketDataTitle: 'Actual market data',
    quote: '{symbol} last close {price} ({change} on the day, as of {asOf}). Source: {source} data{realtime}.',
    realtimeNote: ', not real-time',
    trend: '30-day change {d30}, 90-day change {d90}, 52-week range {low} to {high}.',
    predictionTitle: 'LSTM model prediction',
    prediction: 'The model estimates {first} on {firstDate} and {last} on {lastDate} ({days}-day horizon). These are model estimates, not guaranteed prices.',
    predictionUnavailable: 'Unavailable right now: {reason}. No forecast is included.',
    technicalTitle: 'Technical indicators',
    technicalItem: '{name}: {state} ({detail})',
    technicalItemPlain: '{name}: {state}',
    technicalSummary: 'Overall indicator bias: {bias}.',
    newsTitle: 'News sentiment',
    news: '{count} sample articles, average score {score} ({label}): {positive} positive, {neutral} neutral, {negative} negative. Method: lexicon scoring on sample news.',
    interpretationTitle: 'AI interpretation',
    pointUp: 'the model points higher ({move} versus the last close)',
    pointDown: 'the model points lower ({move} versus the last close)',
    pointFlat: 'the model points roughly flat ({move} versus the last close)',
    pointIndicators: 'indicators lean {bias}',
    pointNews: 'news sentiment is {label}',
    agree: 'The available signals agree.',
    mixed: 'The available signals are mixed, so confidence in any single direction should be low.',
    notAdvice: 'This is an interpretation of the data above, not financial advice.',
    market: 'As of {asOf} ({source} data, not real-time). Advancers {advancers}, decliners {decliners}, unchanged {unchanged}.',
    gainers: 'Top gainers: {list}.',
    losers: 'Top losers: {list}.',
    marketSentiment: 'Blended market sentiment reads {label} (score {score}). This is not financial advice.',
    fallbackNotice: 'The external language model could not be reached, so this answer was generated by the built-in rule-based composer. Reason: {reason}',
    help: "I'm Alpha AI. Ask me about a listed symbol, for example:\n- What is the current outlook for VIC?\n- Show the LSTM prediction for FPT over 30 days\n- Is HPG overbought? What do RSI and MACD say?\n- What is the news sentiment for VCB?\n- How is the market today?\n\nI only report data and model outputs from the connected services and never invent prices or forecasts.",
    states: { bullish: 'bullish', bearish: 'bearish', neutral: 'neutral' },
    sentiments: { positive: 'positive', neutral: 'neutral', negative: 'negative' },
    indicators: {}
  }
};
