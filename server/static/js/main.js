document.addEventListener('DOMContentLoaded', function() {
    // 设置菜单切换
    const menuItems = document.querySelectorAll('.menu-item');
    const settingsTabs = document.querySelectorAll('.settings-tab');

    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            // 移除所有active类
            menuItems.forEach(i => i.classList.remove('active'));
            settingsTabs.forEach(tab => tab.classList.remove('active'));

            // 添加active类到当前项
            item.classList.add('active');
            const tabId = `${item.dataset.tab}-tab`;
            document.getElementById(tabId).classList.add('active');
        });
    });

    // 工具按钮事件处理
    const uploadButton = document.getElementById('upload-button');
    const clearButton = document.getElementById('clear-button');
    const imageInput = document.createElement('input');
    imageInput.type = 'file';
    imageInput.accept = 'image/*';
    imageInput.multiple = true;
    imageInput.style.display = 'none';
    document.body.appendChild(imageInput);

    uploadButton.addEventListener('click', () => {
        imageInput.click();
    });

    clearButton.addEventListener('click', () => {
        showCustomConfirm('确认要清空页面吗？', () => {
            clearMessages();
            showCustomMessage('页面已清空');
        });
    });
}); 