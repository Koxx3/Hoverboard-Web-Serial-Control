class Serial {
  constructor(size) {
    this.API = 'bluetooth';
    this.protocol = '';
    this.bluetoothName = 'BT05';
    this.bluetoothService = 0xffe0;
    this.bluetoothCharacteristic = 0xffe1;
    this.connected = false;
    this.binary = false;
    this.bufferSize = size;
    this.writeBuffer = new ArrayBuffer(this.bufferSize);
    this.writedv = new DataView(this.writeBuffer);
    this.messageSize = 59;
    this.readBuffer = new ArrayBuffer(this.messageSize);
    this.readdv = new DataView(this.readBuffer);
    this.writeOffset = 0;
    this.readOffset = 0;
    this.error = 0;
    this.skip = 0;
    this.success = 0;
    this.serial_start_frame_display_to_esc = 0xA5;
    this.serial_start_frame_esc_to_display = 0x5A;
    this.serial_length = 23;
    this.ibus_length = 0x20;
    this.ibus_command = 0x40;
    this.lastStatsUpdate = Date.now();
    this.statsUpdateFrequency = 500;
	this.checksum = 0;
	
	
this.Frame_start                = 0x00   ;
this.Type                       = 0x00   ;
this.Destination                = 0x00   ;
this.Number_of_ESC              = 0x00   ;
this.BMS_protocol               = 0x00   ;
this.ESC_Jumps                  = 0x00   ;
this.Display_Version_Maj        = 0x00   ;
this.Display_Version_Main       = 0x00   ;
this.Power_ON                   = 0x00   ;
this.Throttle                   = 0x00   ;
this.Brake                      = 0x00    ;
this.Torque                     = 0x00    ;
this.Brake_torque               = 0x00    ;
this.Lock                       = 0x00    ;
this.Regulator                  = 0x00    ;
this.Motor_direction            = 0x00    ;
this.Hall_sensors_direction     = 0x00    ;
this.Ligth_power                = 0x00    ;
this.Max_temperature_reduce     = 0x00    ;
this.Max_temperature_shutdown   = 0x00    ;
this.Speed_limit_               = 0x00    ;
this.Motor_start_speed          = 0x00    ;
this.CRC8                       = 0x00    ;

	
    this.fieldsAscii = {1:'in1',
                        2:'in2',
                        3:'currentDC',
                        4:'cmdL',
                        5:'BatADC',
                        6:'BatV',
                        7:'TempADC',
						8:'curDC_max', 
                        9:'Temp'
                        };
  }


  setConnected(){
    connect_btn.innerHTML = '<ion-icon name="flash-off"></ion-icon>';
    API.disabled = baudrate.disabled = this.connected = true;
    send_btn.disabled = !this.connected;  
  }

  setDisconnected(){
    connect_btn.innerHTML = '<ion-icon name="flash"></ion-icon>';
    API.disabled = this.connected = false;
    baudrate.disabled = (this.API == "bluetooth");
    send_btn.disabled = !this.connected;
  } 

  async connect() {
    if (this.connected){
      // disconnect
      if (this.API == 'bluetooth'){
        this.device.gatt.disconnect();
      }else{
        this.reader.cancel();
      }

      // Update UI
      this.setDisconnected();
      return;
    }
    
    if ( this.API == 'serial'){
      this.connectSerial();
    }else{
      this.connectBluetooth();
    } 
  }

  async connectSerial(){
    if ("serial" in navigator) {

      this.port = await navigator.serial.requestPort();
      // Open and begin reading.
      await this.port.open({
        baudRate: baudrate.value
      });
      
      // Update UI
      this.setConnected();
 
      while (this.port.readable) {
        this.inputStream = this.port.readable;
        this.reader = this.inputStream.getReader();
        
        try{
          while (true){
            const { value, done } = await this.reader.read();
            if (done) {
              log.write("Reader canceled",2);
              break;
            }
    
            //if (serial.binary) serial.sendBinary();
            this.bufferWrite(value);
            this.readLoop();
            if (!this.connected) break;
          }
        }catch (error) {
          // Handle non-fatal read error.
          console.log(error,2);
        } finally{
          
        }
        if (!this.connected) break;   
      }

      this.reader.releaseLock();
      this.port.close();
      this.setDisconnected();
    }
  }

  connectBluetooth(){
    let options = {
          //acceptAllDevices:true,
          optionalServices:[this.bluetoothService],
          filters: [{ name: [this.bluetoothName] },{services: [this.bluetoothService]}],
          };
    navigator.bluetooth.requestDevice(options)
    .then(device => {
      //console.log(device);
      this.device = device;
      device.addEventListener('gattserverdisconnected', this.onDisconnected);
      return device.gatt.connect();
    }).
    then((server) => {
      //console.log(server);
      this.server = server;
      return server.getPrimaryService(this.bluetoothService);
    })
    .then((service) => {
      //console.log(service);
      this.service = service;
      return service.getCharacteristic(this.bluetoothCharacteristic);
    })
    .then(characteristic => characteristic.startNotifications())
    .then((characteristic) => {
      //console.log(characteristic);
      this.characteristic = characteristic;
      // Update UI
      this.setConnected();
      this.characteristic.addEventListener('characteristicvaluechanged',this.handleCharacteristicValueChanged);
    })
    .catch(error => {
      console.log(error);
    });
  }

  handleCharacteristicValueChanged(event) {
    let chunk = new Uint8Array(event.target.value.buffer);
    serial.bufferWrite(chunk);
    serial.readLoop();
    //serial.sendBinary();
  }

  onDisconnected(event) {
    // Update UI
    serial.setDisconnected();
  }

  bufferWrite(chunk){
    // add new chunk to the buffer
    for (let i=0, strLen=chunk.length; i < strLen; i++) {       
      this.writedv.setUint8(this.address(this.writeOffset),chunk[i],true);
      this.setWriteOffset(this.writeOffset + 1);
    }
  }

  readLoop(){
    if (this.binary){
      // read as long as there is enough data in the buffer
      while ( (this.writeOffset) >= (this.readOffset + this.messageSize)){
        this.readBinary();
      }
    }else{
      // Read buffer until \n
      while ( (this.writeOffset) >= (this.readOffset)){
        if (this.writedv.getUint8(this.address(this.readOffset),true) != 0x0A){
          this.skipByte();
        }else{
          let found = this.readAscii();
          if (!found) break;
        }
      }
    }
    this.displayStats();
  }

  address(offset){
    return offset%this.bufferSize;
  }
  
  setReadOffset(offset){
    this.readOffset = offset; 
  }

  setWriteOffset(offset){
    this.writeOffset = offset;
  }

  skipByte(){
    this.setReadOffset(this.readOffset + 1); // incorrect start frame, increase read offset
    this.skip++;
  }

  displayStats(){
    if ( ( Date.now() - this.lastStatsUpdate < this.statsUpdateFrequency) || statsdiv.style.display == 'none' ) return;
      this.lastStatsUpdate = Date.now();

    read.value = this.address(this.readOffset);
    write.value = this.address(this.writeOffset);
    success.value = this.success;
    skip.value = this.skip;
    error.value = this.error;
  }

  readBinary(){
    // copy chunk to new arrayBuffer
    for (let i=0, strLen=this.messageSize; i < strLen; i++) {       
      let val = this.writedv.getUint8(this.address(this.readOffset + i),true);
      this.readdv.setUint8(i,val,true);
    }
    
    let frame = this.readdv.getUint8(0,true);
    if (frame != this.serial_start_frame_esc_to_display){
      this.skipByte();    
      return;
    }

    let message = {};

/*
    message.cmd1     		= this.readdv.getInt16(2,true);
    message.cmd2     		= this.readdv.getInt16(4,true);
    message.currentDC		= this.readdv.getInt16(6,true);
    message.speedMeas   	= this.readdv.getInt16(8,true);
    message.BatV     		= this.readdv.getInt16(10,true);
    message.Temp     		= this.readdv.getInt16(12,true);
    message.currentMaxPhA   = this.readdv.getInt16(14,true);
    message.speedMotor      = this.readdv.getInt16(16,true);
    message.checksum 		= this.readdv.getUint16(18,true);
	*/
	
	let i = 1;
	
	message.Type                                = this.readdv.getUint8(i,true); i++;
	message.ESC_Version_Maj                     = this.readdv.getUint8(i,true); i++;
	message.ESC_Version_Min                     = this.readdv.getUint8(i,true); i++;
	message.Throttle                            = this.readdv.getUint8(i,true); i++;
	message.Brake                               = this.readdv.getUint8(i,true); i++;
	message.Controller_Voltage_LSB              = this.readdv.getUint8(i,true); i++;
	message.Controller_Voltage_MSB              = this.readdv.getUint8(i,true); i++;
	message.Controller_Current_LSB              = this.readdv.getUint8(i,true); i++;
	message.Controller_Current_MSB              = this.readdv.getUint8(i,true); i++;
	message.MOSFET_temperature                  = this.readdv.getUint8(i,true); i++;
	message.ERPM_LSB                            = this.readdv.getUint8(i,true); i++;
	message.ERPM_MSB                            = this.readdv.getUint8(i,true); i++;
	message.Lock_status                         = this.readdv.getUint8(i,true); i++;
	message.Ligth_status                        = this.readdv.getUint8(i,true); i++;
	message.Regulator_status                    = this.readdv.getUint8(i,true); i++;
	message.Phase_1_current_max_LSB             = this.readdv.getUint8(i,true); i++;
	message.Phase_1_current_max_MSB             = this.readdv.getUint8(i,true); i++;
	message.Phase_1_voltage_max_LSB             = this.readdv.getUint8(i,true); i++;
	message.Phase_1_voltage_max_MSB             = this.readdv.getUint8(i,true); i++;
	message.BMS_Version_Maj                     = this.readdv.getUint8(i,true); i++;
	message.BMS_Version_Min                     = this.readdv.getUint8(i,true); i++;
	message.BMS_voltage_LSB                     = this.readdv.getUint8(i,true); i++;
	message.BMS_voltage_MSB                     = this.readdv.getUint8(i,true); i++;
	message.BMS_Current_LSB                     = this.readdv.getUint8(i,true); i++;
	message.BMS_Current_MSB                     = this.readdv.getUint8(i,true); i++;
	message.BMS_Cells_status_group_1            = this.readdv.getUint8(i,true); i++;
	message.BMS_Cells_status_group_2            = this.readdv.getUint8(i,true); i++;
	message.BMS_Cells_status_group_3            = this.readdv.getUint8(i,true); i++;
	message.BMS_Cells_status_group_4            = this.readdv.getUint8(i,true); i++;
	message.BMS_Cells_status_group_5            = this.readdv.getUint8(i,true); i++;
	message.BMS_Cells_status_group_6            = this.readdv.getUint8(i,true); i++;
	message.BMS_Cells_status_group_7            = this.readdv.getUint8(i,true); i++;
	message.BMS_Cells_status_group_8            = this.readdv.getUint8(i,true); i++;
	message.BMS_Cells_status_group_9            = this.readdv.getUint8(i,true); i++;
	message.BMS_Cells_status_group_10           = this.readdv.getUint8(i,true); i++;
	message.BMS_Cells_status_group_11           = this.readdv.getUint8(i,true); i++;
	message.BMS_Cells_status_group_12           = this.readdv.getUint8(i,true); i++;
	message.BMS_Cells_status_group_13           = this.readdv.getUint8(i,true); i++;
	message.BMS_Cells_status_group_14           = this.readdv.getUint8(i,true); i++;
	message.BMS_Cells_status_group_15           = this.readdv.getUint8(i,true); i++;
	message.BMS_Cells_status_group_16           = this.readdv.getUint8(i,true); i++;
	message.BMS_Cells_status_group_17           = this.readdv.getUint8(i,true); i++;
	message.BMS_Cells_status_group_18           = this.readdv.getUint8(i,true); i++;
	message.BMS_Cells_status_group_19           = this.readdv.getUint8(i,true); i++;
	message.BMS_Cells_status_group_20           = this.readdv.getUint8(i,true); i++;
	message.BMS_Cells_status_group_21           = this.readdv.getUint8(i,true); i++;
	message.BMS_Cells_status_group_22           = this.readdv.getUint8(i,true); i++;
	message.BMS_Cells_status_group_23           = this.readdv.getUint8(i,true); i++;
	message.BMS_Cells_status_group_24           = this.readdv.getUint8(i,true); i++;
	message.BMS_Battery_tempature_1             = this.readdv.getUint8(i,true); i++;
	message.BMS_Battery_tempature_2             = this.readdv.getUint8(i,true); i++;
	message.BMS_Charge_cycles_full_LSB          = this.readdv.getUint8(i,true); i++;
	message.BMS_Charge_cycles_full_MSB          = this.readdv.getUint8(i,true); i++;
	message.BMS_Charge_cycles_partial_LSB       = this.readdv.getUint8(i,true); i++;
	message.BMS_Charge_cycles_partial_MSB       = this.readdv.getUint8(i,true); i++;
	message.Errors_LSB                          = this.readdv.getUint8(i,true); i++;
	message.Errors_MSB                          = this.readdv.getUint8(i,true); i++;
	message.CRC8                                = this.readdv.getUint8(i,true); i++;
	
	
    let calcChecksum = frame
                        ^ message.Type                                        //
						^ message.ESC_Version_Maj                             //
						^ message.ESC_Version_Min                             //
						^ message.Throttle                                    //
						^ message.Brake                                       //
						^ message.Controller_Voltage_LSB                      //
						^ message.Controller_Voltage_MSB                      //
						^ message.Controller_Current_LSB                      //
						^ message.Controller_Current_MSB                      //
						^ message.MOSFET_temperature                          //
						^ message.ERPM_LSB                                    //
						^ message.ERPM_MSB                                    //
						^ message.Lock_status                                 //
						^ message.Ligth_status                                //
						^ message.Regulator_status                            //
						^ message.Phase_1_current_max_LSB                     //
						^ message.Phase_1_current_max_MSB                     //
						^ message.Phase_1_voltage_max_LSB                     //
						^ message.Phase_1_voltage_max_MSB                     //
						^ message.BMS_Version_Maj                             //
						^ message.BMS_Version_Min                             //
						^ message.BMS_voltage_LSB                             //
						^ message.BMS_voltage_MSB                             //
						^ message.BMS_Current_LSB                             //
						^ message.BMS_Current_MSB                             //
						^ message.BMS_Cells_status_group_1                    //
						^ message.BMS_Cells_status_group_2                    //
						^ message.BMS_Cells_status_group_3                    //
						^ message.BMS_Cells_status_group_4                    //
						^ message.BMS_Cells_status_group_5                    //
						^ message.BMS_Cells_status_group_6                    //
						^ message.BMS_Cells_status_group_7                    //
						^ message.BMS_Cells_status_group_8                    //
						^ message.BMS_Cells_status_group_9                    //
						^ message.BMS_Cells_status_group_10                   //
						^ message.BMS_Cells_status_group_11                   //
						^ message.BMS_Cells_status_group_12                   //
						^ message.BMS_Cells_status_group_13                   //
						^ message.BMS_Cells_status_group_14                   //
						^ message.BMS_Cells_status_group_15                   //
						^ message.BMS_Cells_status_group_16                   //
						^ message.BMS_Cells_status_group_17                   //
						^ message.BMS_Cells_status_group_18                   //
						^ message.BMS_Cells_status_group_19                   //
						^ message.BMS_Cells_status_group_20                   //
						^ message.BMS_Cells_status_group_21                   //
						^ message.BMS_Cells_status_group_22                   //
						^ message.BMS_Cells_status_group_23                   //
						^ message.BMS_Cells_status_group_24                   //
						^ message.BMS_Battery_tempature_1                     //
						^ message.BMS_Battery_tempature_2                     //
						^ message.BMS_Charge_cycles_full_LSB                  //
						^ message.BMS_Charge_cycles_full_MSB                  //
						^ message.BMS_Charge_cycles_partial_LSB               //
						^ message.BMS_Charge_cycles_partial_MSB               //
						^ message.Errors_LSB                                  //
						^ message.Errors_MSB                                  //
					   ;
    
	message.Controller_Voltage = message.Controller_Voltage_LSB && (message.Controller_Voltage_MSB << 8);
	message.Controller_Current = message.Controller_Current_LSB && (message.Controller_Current_MSB << 8);
	message.ERPM = message.ERPM_LSB && (message.ERPM_MSB << 8);
	message.Phase_1_current_max = message.Phase_1_current_max_LSB && (message.Phase_1_current_max_MSB << 8);
	message.Phase_1_voltage_max = message.Phase_1_voltage_max_LSB && (message.Phase_1_voltage_max_MSB << 8);

	var messageFiltered = Object.keys(message).reduce((acc, elem) => {
		if (!elem.startsWith("BMS") && !elem.startsWith("CRC") && !elem.startsWith("ESC_Version") && !elem.startsWith("Type") && !elem.endsWith("LSB")  && !elem.endsWith("MSB") ) acc[elem] = message[elem]
		return acc
	}, {})
	//console.log(messageFiltered)

    // Trick to convert calculated Checksum to unsigned
    //this.readdv.setInt16(16,calcChecksum,true);
    //calcChecksum = this.readdv.getUint16(16,true);

//	  return !obj[0].startsWith("BMS") && !obj[0].startsWith("CRC") && !obj[0].startsWith("ESC_Version") && !obj[0].startsWith("Type") && !obj[0].endsWith("LSB")  && !obj[0].endsWith("MSB") ;
	
//	let messageFiltered2 = Object.keys( message ).filter( function(key){ return true; });
		
    if ( message.CRC8 == calcChecksum ){
		
	
      this.success++;
      graph.updateData(messageFiltered);
      control.updateTelemetry(messageFiltered);
      log.writeLog(messageFiltered);
    }else{  
      this.error++;
      log.write(Object.keys( messageFiltered ).map( function(key){ return key + ":" +messageFiltered[key] }).join(" "),2);
    }

    this.setReadOffset(this.readOffset + this.messageSize); // increase read offset by message size
  }
 
  readAscii(){
    let string = '';
    let i = 1;
    let found = false;
    // read until next \n
    while (this.writeOffset >= this.readOffset + i){
      let char = this.writedv.getUint8(this.address(this.readOffset + i),true); 
      if ( char == 0x0A){
        // Save new read pointer
        this.setReadOffset(this.readOffset + i);
        found = true;
        break;  
      }else{
        string += String.fromCharCode(char);
        i++;
      }
    }
    
    // \n not found, buffer probably doesn't have enough data, exit
    if (!found){
      return false;
    }

    let words = string.split(" ");
    let message = {};
    let err = false;

    // If first word doesn't contain semi-colon, no need to parse it
    if (words[0].split(":").length == 1 ){
      log.write(string,3);
      return true;
    }
    
    for(let j = 0; j < words.length; j++) {
      let [index,value] = words[j].split(':');
      
      if (value === undefined) err = true;
      
      if (index in this.fieldsAscii){
        message[this.fieldsAscii[index]] = value;
      }else{
        message[index] = value;
      }
    }
  
    if (!err && Object.entries(message).length > 0) {
      this.success++;
      log.writeLog(message);
      graph.updateData(message);
      control.updateTelemetry(message);
    }else{
      this.error++;
      log.write(string,2);
    }

    return true;
  }

  sendBinary() {
    var ab = new ArrayBuffer(serial.protocol == "usart" ? this.serial_length : this.ibus_length );
    var dv = new DataView(ab);

	this.Brake = control.channel[1] / 4;
	if  (this.Brake < 0)
		this.Brake = 0;
	this.Throttle = control.channel[0] / 4;
	if  (this.Throttle < 0)
		this.Throttle = 0;

    if (serial.protocol == "usart"){
      dv.setUint8(0,  this.serial_start_frame_display_to_esc,true);
	  dv.setUint8(1,  this.Type                             ,true);
	  dv.setUint8(2,  this.Destination                      ,true);
	  dv.setUint8(3,  this.Number_of_ESC                    ,true);
	  dv.setUint8(4,  this.BMS_protocol                     ,true);
	  dv.setUint8(5,  this.ESC_Jumps                        ,true);
	  dv.setUint8(6,  this.Display_Version_Maj              ,true);
	  dv.setUint8(7,  this.Display_Version_Main             ,true);
	  dv.setUint8(8,  this.Power_ON                         ,true);
	  dv.setUint8(9,  this.Throttle                         ,true);
	  dv.setUint8(10, this.Brake                            ,true);
	  dv.setUint8(11, this.Torque                           ,true);
	  dv.setUint8(12, this.Brake_torque                     ,true);
	  dv.setUint8(13, this.Lock                             ,true);
	  dv.setUint8(14, this.Regulator                        ,true);
	  dv.setUint8(15, this.Motor_direction                  ,true);
	  dv.setUint8(16, this.Hall_sensors_direction           ,true);
	  dv.setUint8(17, this.Ligth_power                      ,true);
	  dv.setUint8(18, this.Max_temperature_reduce           ,true);
	  dv.setUint8(19, this.Max_temperature_shutdown         ,true);
	  dv.setUint8(20, this.Speed_limit_                     ,true);
	  dv.setUint8(21, this.Motor_start_speed                ,true);

      this.checksum = this.serial_start_frame_display_to_esc //
		^ this.Type                       //
		^ this.Destination                //
		^ this.Number_of_ESC              //
		^ this.BMS_protocol               //
		^ this.ESC_Jumps                  //
		^ this.Display_Version_Maj        //
		^ this.Display_Version_Main       //
		^ this.Power_ON                   //
		^ this.Throttle                   //
		^ this.Brake                      //
		^ this.Torque                     //
		^ this.Brake_torque               //
		^ this.Lock                       //
		^ this.Regulator                  //
		^ this.Motor_direction            //
		^ this.Hall_sensors_direction     //
		^ this.Ligth_power                //
		^ this.Max_temperature_reduce     //
		^ this.Max_temperature_shutdown   //
		^ this.Speed_limit_               //
		^ this.Motor_start_speed            ;
	  
      dv.setUint8(22, this.checksum, true);
		
      let bytes = new Uint8Array(ab);
      this.send(bytes);
    }else{
      // Write Ibus Start Frame
      dv.setUint8(0,this.ibus_length);
      dv.setUint8(1,this.ibus_command);
      // Write channel values
      for (let i=0; i< control.channel.length * 2;i+=2){
        dv.setUint16(i+2, control.map(control.channel[i/2] ,-1000,1000,1000,2000) ,true);
      }

      // Calculate checksum
      let checksum = 0xFFFF;
      for (let i=0; i<this.ibus_length-2;i++){
        checksum -= dv.getUint8(i);
      }
      dv.setUint16(this.ibus_length-2,checksum,true);
      
      let bytes = new Uint8Array(ab);
      this.send(bytes);
    }
  };

  sendAscii(text) {
    let command = text + (crIn.checked ?"\r":"") + (lfIn.checked ?"\n":"");

    let encoder = new TextEncoder();
    let bytes = encoder.encode(command);
    this.send(bytes);
  };

  async send(bytes){
    if (this.API == 'serial'){
      // Web Serial
      this.outputStream = this.port.writable;
      this.writer = this.outputStream.getWriter();
      this.writer.write(bytes);
      this.writer.releaseLock();
    }else{
      // Web Bluetooth
      let chunksize = 20;
      let sent = 0;
      while(sent < bytes.length){
        // Sent chunks of 20 bytes because of BLE limitation
        //console.log(bytes.slice(sent,sent+chunksize));
        await this.characteristic.writeValueWithResponse(bytes.slice(sent,sent+chunksize));
        sent += chunksize;
      }
    } 
  }
}
