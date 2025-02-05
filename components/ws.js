// WebSocket连接类
class WSConnection {
  static instance = null;

  static getInstance() {
    if (!WSConnection.instance) {
      WSConnection.instance = new WSConnection();
    }
    return WSConnection.instance;
  }

  constructor() {
    if (WSConnection.instance) {
      return WSConnection.instance;
    }
    
    this.ws = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectInterval = 3000;
    
    WSConnection.instance = this;
  }

  // 连接WebSocket服务器
  connect(ip, port) {
    if (this.isConnected) {
      console.log('WebSocket已经连接');
      return Promise.resolve(true);
    }

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(`ws://${ip}:${port}`);
        
        this.ws.onopen = () => {
          console.log('WebSocket连接成功');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          resolve(true);
        };

        this.ws.onclose = () => {
          console.log('WebSocket连接关闭');
          this.isConnected = false;
          this.tryReconnect();
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket错误:', error);
          reject(error);
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

      } catch (error) {
        console.error('连接错误:', error);
        reject(error);
      }
    });
  }

  // 重连机制
  tryReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('达到最大重连次数');
      return;
    }

    setTimeout(() => {
      console.log(`尝试重连... (${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
      this.reconnectAttempts++;
      this.connect(this.ip, this.port);
    }, this.reconnectInterval);
  }

  // 发送消息
  sendMessage(message, mode = 'ss') {
    if (!this.isConnected) {
      console.error('WebSocket未连接');
      return false;
    }

    try {
      const msgObj = {
        type: mode,
        content: message,
        timestamp: new Date().getTime()
      };

      this.ws.send(JSON.stringify(msgObj));
      return true;
    } catch (error) {
      console.error('发送消息错误:', error);
      return false;
    }
  }

  // 处理接收到的消息
  handleMessage(data) {
    try {
      const msgObj = JSON.parse(data);
      
      // 根据消息类型处理
      switch(msgObj.type) {
        case 'ss':
        case 'gg':
          // 触发消息显示事件
          this.triggerMessageEvent(msgObj);
          break;
        case 'error':
          console.error('服务器错误:', msgObj.content);
          break;
        default:
          console.log('未知消息类型:', msgObj);
      }
    } catch (error) {
      console.error('处理消息错误:', error);
    }
  }

  // 触发消息显示事件
  triggerMessageEvent(msgObj) {
    const event = new CustomEvent('ws-message', {
      detail: msgObj
    });
    window.dispatchEvent(event);
  }

  // 关闭连接
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.isConnected = false;
    }
  }
}

// 导出WebSocket连接实例
export const wsConnection = WSConnection.getInstance(); 