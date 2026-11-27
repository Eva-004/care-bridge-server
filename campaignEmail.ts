type Campaign = {
    title: string;
    description: string;
    date: string;
    time: string;
    location: string;
};

export const campaignEmail = (campaign: Campaign) => {
    return `
        <div style="font-family: Arial, sans-serif; max-width: 550px; margin: auto; padding: 25px; background: #F8F9FA; color: #1D2D44;">

            <h2 style="color: #0F4C5C;">CareBridge</h2>

            <h3>New Campaign in Your Area!</h3>

            <p>Hello,</p>

            <p>A new campaign has been announced in your area. Here are the details:</p>

            <div style="background: white; padding: 20px; border-radius: 8px;">
                <h2 style="color: #0F4C5C;">${campaign.title}</h2>

                <p>${campaign.description}</p>

                <p><strong>Date:</strong> ${campaign.date}</p>
                <p><strong>Time:</strong> ${campaign.time}</p>
                <p><strong>Location:</strong> ${campaign.location}</p>
            </div>

            <p>Stay connected with CareBridge and be part of this initiative.</p>

            <p style="color: #0F4C5C; font-weight: bold;">Team CareBridge</p>

            <p style="font-size: 12px; color: #777;">
                This is an automated notification from CareBridge.
            </p>
        </div>
    `;
};