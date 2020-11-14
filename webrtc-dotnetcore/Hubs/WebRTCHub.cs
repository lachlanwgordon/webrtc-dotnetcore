using Microsoft.AspNetCore.SignalR;
using Newtonsoft.Json;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading.Tasks;

namespace webrtc_dotnetcore.Hubs
{
    public class WebRTCHub : Hub
    {
       

        public override Task OnConnectedAsync()
        {
            return base.OnConnectedAsync();
        }

        public override Task OnDisconnectedAsync(Exception exception)
        {
            return base.OnDisconnectedAsync(exception);
        }


        public async Task SendMessage(object message)
        {
            Debug.WriteLine($"Send message:\n {message}");
            await Clients.Others.SendAsync("message", message);
        }

        public async Task Test()
        {
            //await Clients.All.SendAsync("test");
        }

    }
   
}
