export default
`
<view id="guest">
  <view id="guestContainer">
    <view class="header">
      <image class="close" data-click="execFlow" data-flowid="closeComponent" src="https://res.wx.qq.com/wechatgame/product/webpack/userupload/20200130/close.png"></image>
      <text class="title" value="朋友助力得道具"></text>
    </view>

    <image id="guestGiftImage" class="giftIcon" src="https://res.wx.qq.com/wechatgame/product/webpack/userupload/20200212/defaultGift.png"></image>
    <text id="guestGiftTips" class="giftTips" value="邀请5个好友即可获得奖励"></text>

    <text id="guestGiftButton" class="giftButton" value="我也要" data-click="execFlow" data-flowid="create_share"></text>
  </view>
</view>
`
