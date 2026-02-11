import 'package:flutter/material.dart';
import 'package:camera/camera.dart';
import 'dart:io';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as path;
import '../../models/delivery.dart';
import '../../services/delivery_service.dart';

class DeliveryCameraScreen extends StatefulWidget {
  final Delivery delivery;
  final String proofType; // 'pickup' or 'delivery'

  const DeliveryCameraScreen({
    super.key,
    required this.delivery,
    required this.proofType,
  });

  @override
  State<DeliveryCameraScreen> createState() => _DeliveryCameraScreenState();
}

class _DeliveryCameraScreenState extends State<DeliveryCameraScreen> {
  CameraController? _controller;
  List<CameraDescription>? _cameras;
  bool _isInitialized = false;
  bool _isCapturing = false;
  final List<String> _capturedImages = [];
  int _currentCameraIndex = 0;

  @override
  void initState() {
    super.initState();
    _initializeCamera();
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _initializeCamera() async {
    try {
      _cameras = await availableCameras();
      if (_cameras!.isNotEmpty) {
        _controller = CameraController(
          _cameras![_currentCameraIndex],
          ResolutionPreset.high,
          enableAudio: false,
          imageFormatGroup: ImageFormatGroup.jpeg,
        );

        await _controller!.initialize();
        if (mounted) {
          setState(() => _isInitialized = true);
        }
      }
    } catch (e) {
      // Debug statement removed for production security
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Camera initialization failed: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('${widget.proofType == 'pickup' ? 'Pickup' : 'Delivery'} Proof'),
        backgroundColor: const Color(0xFF4CAF50),
        foregroundColor: Colors.white,
        actions: [
          if (_capturedImages.isNotEmpty)
            TextButton(
              onPressed: _submitProof,
              child: Text(
                'Submit (${_capturedImages.length})',
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
              ),
            ),
        ],
      ),
      body: Column(
        children: [
          // Instructions banner
          Container(
            width: double.infinity,
            color: const Color(0xFF4CAF50),
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                Icon(
                  widget.proofType == 'pickup' ? Icons.photo_camera : Icons.assignment_turned_in,
                  color: Colors.white,
                  size: 32,
                ),
                const SizedBox(height: 8),
                Text(
                  widget.proofType == 'pickup' 
                    ? 'Take photos of the items you received'
                    : 'Take photos showing successful delivery',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 4),
                const Text(
                  'Take 1-3 clear photos as proof',
                  style: TextStyle(
                    color: Colors.white70,
                    fontSize: 14,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),

          // Camera preview
          Expanded(
            child: _isInitialized
              ? Stack(
                  children: [
                    // Camera preview
                    SizedBox(
                      width: double.infinity,
                      height: double.infinity,
                      child: FittedBox(
                        fit: BoxFit.cover,
                        child: SizedBox(
                          width: _controller!.value.previewSize!.height,
                          height: _controller!.value.previewSize!.width,
                          child: CameraPreview(_controller!),
                        ),
                      ),
                    ),

                    // Camera controls overlay
                    Positioned(
                      top: 20,
                      right: 20,
                      child: Column(
                        children: [
                          // Flash toggle
                          FloatingActionButton(
                            mini: true,
                            onPressed: _toggleFlash,
                            backgroundColor: Colors.black54,
                            child: Icon(
                              _getFlashIcon(),
                              color: Colors.white,
                              size: 20,
                            ),
                          ),
                          const SizedBox(height: 12),
                          // Camera switch
                          if (_cameras!.length > 1)
                            FloatingActionButton(
                              mini: true,
                              onPressed: _switchCamera,
                              backgroundColor: Colors.black54,
                              child: const Icon(
                                Icons.camera_front,
                                color: Colors.white,
                                size: 20,
                              ),
                            ),
                        ],
                      ),
                    ),

                    // Capture progress indicator
                    if (_isCapturing)
                      Container(
                        color: Colors.black54,
                        child: const Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              CircularProgressIndicator(
                                valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                              ),
                              SizedBox(height: 16),
                              Text(
                                'Capturing photo...',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 18,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
                )
              : const Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      CircularProgressIndicator(),
                      SizedBox(height: 16),
                      Text('Initializing camera...'),
                    ],
                  ),
                ),
          ),

          // Captured images preview
          if (_capturedImages.isNotEmpty)
            Container(
              height: 120,
              color: Colors.grey[100],
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.all(8),
                    child: Text(
                      'Captured Photos (${_capturedImages.length}/3)',
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  Expanded(
                    child: ListView.builder(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      itemCount: _capturedImages.length,
                      itemBuilder: (context, index) {
                        return Container(
                          margin: const EdgeInsets.only(right: 8),
                          child: Stack(
                            children: [
                              ClipRRect(
                                borderRadius: BorderRadius.circular(8),
                                child: Image.file(
                                  File(_capturedImages[index]),
                                  width: 80,
                                  height: 80,
                                  fit: BoxFit.cover,
                                ),
                              ),
                              Positioned(
                                top: 4,
                                right: 4,
                                child: GestureDetector(
                                  onTap: () => _removeImage(index),
                                  child: Container(
                                    padding: const EdgeInsets.all(2),
                                    decoration: const BoxDecoration(
                                      color: Colors.red,
                                      shape: BoxShape.circle,
                                    ),
                                    child: const Icon(
                                      Icons.close,
                                      color: Colors.white,
                                      size: 16,
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),

          // Bottom controls
          Container(
            padding: const EdgeInsets.all(24),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                // Gallery/skip button
                FloatingActionButton(
                  onPressed: _skipPhotos,
                  backgroundColor: Colors.grey[700],
                  child: const Icon(Icons.skip_next, color: Colors.white),
                ),

                // Capture button
                GestureDetector(
                  onTap: _isCapturing || _capturedImages.length >= 3 ? null : _capturePhoto,
                  child: Container(
                    width: 80,
                    height: 80,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: _capturedImages.length >= 3 
                        ? Colors.grey[400] 
                        : const Color(0xFF4CAF50),
                      border: Border.all(color: Colors.white, width: 4),
                    ),
                    child: const Icon(
                      Icons.camera_alt,
                      color: Colors.white,
                      size: 36,
                    ),
                  ),
                ),

                // Submit button (only show if we have photos)
                FloatingActionButton(
                  onPressed: _capturedImages.isNotEmpty ? _submitProof : null,
                  backgroundColor: _capturedImages.isNotEmpty 
                    ? const Color(0xFF4CAF50) 
                    : Colors.grey[400],
                  child: const Icon(Icons.check, color: Colors.white),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  IconData _getFlashIcon() {
    if (_controller?.value.flashMode == FlashMode.auto) {
      return Icons.flash_auto;
    } else if (_controller?.value.flashMode == FlashMode.always) {
      return Icons.flash_on;
    } else {
      return Icons.flash_off;
    }
  }

  Future<void> _toggleFlash() async {
    if (!_isInitialized) return;

    try {
      final currentMode = _controller!.value.flashMode;
      late FlashMode nextMode;

      switch (currentMode) {
        case FlashMode.off:
          nextMode = FlashMode.auto;
          break;
        case FlashMode.auto:
          nextMode = FlashMode.always;
          break;
        case FlashMode.always:
          nextMode = FlashMode.off;
          break;
        case FlashMode.torch:
          nextMode = FlashMode.off;
          break;
      }

      await _controller!.setFlashMode(nextMode);
      setState(() {});
    } catch (e) {
      // Debug statement removed for production security
    }
  }

  Future<void> _switchCamera() async {
    if (_cameras!.length <= 1) return;

    setState(() => _isInitialized = false);
    await _controller?.dispose();

    _currentCameraIndex = (_currentCameraIndex + 1) % _cameras!.length;
    _controller = CameraController(
      _cameras![_currentCameraIndex],
      ResolutionPreset.high,
      enableAudio: false,
      imageFormatGroup: ImageFormatGroup.jpeg,
    );

    await _controller!.initialize();
    if (mounted) {
      setState(() => _isInitialized = true);
    }
  }

  Future<void> _capturePhoto() async {
    if (!_isInitialized || _isCapturing || _capturedImages.length >= 3) return;

    setState(() => _isCapturing = true);

    try {
      final Directory appDir = await getApplicationDocumentsDirectory();
      final String timestamp = DateTime.now().millisecondsSinceEpoch.toString();
      final String fileName = 'delivery_${widget.proofType}_$timestamp.jpg';
      final String filePath = path.join(appDir.path, fileName);

      final XFile photo = await _controller!.takePicture();
      await photo.saveTo(filePath);

      setState(() {
        _capturedImages.add(filePath);
        _isCapturing = false;
      });

      // Provide haptic feedback
      // HapticFeedback.lightImpact();
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Photo captured (${_capturedImages.length}/3)'),
          backgroundColor: const Color(0xFF4CAF50),
          duration: const Duration(seconds: 1),
        ),
      );
    } catch (e) {
      setState(() => _isCapturing = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed to capture photo: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  void _removeImage(int index) {
    setState(() {
      // Delete the file
      final file = File(_capturedImages[index]);
      file.delete().catchError((e) {
        print('Error deleting file: $e');
        return file; // Return file to satisfy catchError return type
      });

      // Remove from list
      _capturedImages.removeAt(index);
    });
  }

  Future<void> _submitProof() async {
    if (_capturedImages.isEmpty) return;

    try {
      // Show loading dialog
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (context) => const AlertDialog(
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CircularProgressIndicator(),
              SizedBox(height: 16),
              Text('Uploading proof photos...'),
            ],
          ),
        ),
      );

      // Update delivery status with proof images
      final status = widget.proofType == 'pickup' 
        ? DeliveryStatus.pickedUp 
        : DeliveryStatus.delivered;

      await DeliveryService.updateDeliveryStatus(
        widget.delivery.id,
        status,
        proofImages: _capturedImages,
        notes: '${widget.proofType} completed with photo proof (${_capturedImages.length} images)',
      );

      if (mounted) {
        Navigator.pop(context); // Close loading dialog
        Navigator.pop(context, true); // Return success

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${widget.proofType == 'pickup' ? 'Pickup' : 'Delivery'} proof submitted successfully!'),
            backgroundColor: const Color(0xFF4CAF50),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        Navigator.pop(context); // Close loading dialog
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to submit proof: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  void _skipPhotos() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Skip Photos?'),
        content: Text(
          'Are you sure you want to continue without taking photos? '
          '${widget.proofType == 'pickup' ? 'Pickup' : 'Delivery'} proof photos help protect both you and the pharmacy.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Take Photos'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(context); // Close dialog
              Navigator.pop(context, false); // Return without photos
            },
            child: const Text('Skip', style: TextStyle(color: Colors.orange)),
          ),
        ],
      ),
    );
  }
}